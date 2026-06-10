import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, MapPin, Users, GraduationCap, CalendarClock, Phone, Mail, UserCog } from "lucide-react";
import { getTeamProgress } from "@/lib/kpi";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn, formatDate } from "@/lib/utils";
import { TeamTabs } from "./team-tabs";
import { TeamNotes } from "./team-notes";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) notFound();

  // 자기 팀만 가능한 역할 가드
  if (isTeamScoped(session.role!) && session.teamId && session.teamId !== teamId) {
    redirect(`/teams/${session.teamId}`);
  }

  const [rows, progress, noteRows] = await Promise.all([
    db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1),
    getTeamProgress(teamId),
    db
      .select({
        id: schema.teamNotes.id,
        noteDate: schema.teamNotes.noteDate,
        content: schema.teamNotes.content,
        createdByName: schema.teamNotes.createdByName,
      })
      .from(schema.teamNotes)
      .where(eq(schema.teamNotes.teamId, teamId))
      .orderBy(desc(schema.teamNotes.noteDate), desc(schema.teamNotes.id)),
  ]);
  const team = rows[0];
  if (!team) notFound();

  // 특이사항 작성 권한: 관리자 또는 (자기 팀) 코디네이터
  const canEditNotes =
    session.role === "admin" || (session.role === "coordinator" && session.teamId === teamId);

  return (
    <div>
      <div className="border-b bg-background px-6 py-5 space-y-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          대시보드로
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={cn("border", PRODUCT_COLORS[team.product as Product])}>{team.product}</Badge>
              <Badge variant="outline">{team.cohort}</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
            <p className="text-sm text-muted-foreground">{team.courseName}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Users className="h-4 w-4" />{team.headCount}명</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{team.region}</span>
              <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" />최종 {formatDate(team.endDate)}</span>
            </div>

            {/* 담당자 카드 + 특이사항(2칸 = 담당자 카드의 약 2배 너비) */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 items-start gap-2 max-w-5xl pt-1">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" />
                  주임교수
                </div>
                <div className="font-medium text-sm">{team.professorName || "미입력"}</div>
                {team.professorPhone && (
                  <a href={`tel:${team.professorPhone.replace(/-/g, "")}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Phone className="h-3 w-3" /><span className="tabular-nums">{team.professorPhone}</span>
                  </a>
                )}
                {team.professorEmail && (
                  <a href={`mailto:${team.professorEmail}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Mail className="h-3 w-3" /><span className="truncate">{team.professorEmail}</span>
                  </a>
                )}
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserCog className="h-3.5 w-3.5" />
                  코디네이터
                </div>
                <div className="font-medium text-sm">{team.coordinatorName || "미입력"}</div>
                {team.coordinatorPhone && (
                  <a href={`tel:${team.coordinatorPhone.replace(/-/g, "")}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Phone className="h-3 w-3" /><span className="tabular-nums">{team.coordinatorPhone}</span>
                  </a>
                )}
                {team.coordinatorEmail && (
                  <a href={`mailto:${team.coordinatorEmail}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Mail className="h-3 w-3" /><span className="truncate">{team.coordinatorEmail}</span>
                  </a>
                )}
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <TeamNotes teamId={teamId} notes={noteRows} canEdit={canEditNotes} />
              </div>
            </div>
          </div>
          <div className="min-w-[260px] space-y-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">진행률</div>
                <div className="text-2xl font-bold text-emerald-600">{progress.progressPercent}%</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">교육생</div>
                <div className="text-2xl font-bold">{team.headCount}명</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">차시</div>
                <div className="text-2xl font-bold">{progress.done}/{progress.effectiveTotal}</div>
                {progress.cancelled > 0 && (
                  <div className="text-[10px] text-muted-foreground">취소 {progress.cancelled}</div>
                )}
              </div>
            </div>
            <Progress value={progress.progressPercent} indicatorClassName="bg-emerald-500" />
          </div>
        </div>
        <TeamTabs teamId={teamId} />
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
