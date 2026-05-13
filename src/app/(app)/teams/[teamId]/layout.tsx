import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, MapPin, Users, GraduationCap, CalendarClock } from "lucide-react";
import { getTeamProgress } from "@/lib/kpi";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn, formatDate } from "@/lib/utils";
import { TeamTabs } from "./team-tabs";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";

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

  const rows = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  const team = rows[0];
  if (!team) notFound();
  const progress = await getTeamProgress(teamId);

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
              <span className="flex items-center gap-1"><GraduationCap className="h-4 w-4" />{team.professorName} 주임교수</span>
              <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" />최종 {formatDate(team.endDate)}</span>
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
                <div className="text-2xl font-bold">{progress.done}/{progress.total}</div>
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
