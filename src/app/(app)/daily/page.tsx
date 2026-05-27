import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { CalendarDays, Users, UserX, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DailySyncButton } from "./daily-sync-button";
import { ManualEntryButton } from "./manual-entry-button";
import { getCurrentUser } from "@/lib/auth";
import { canUploadDocument } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const user = await getCurrentUser();
  const role = (user?.role ?? "professor") as Role;
  const today = new Date().toISOString().slice(0, 10);

  const [teams, todaySessions, todayReports, status] = await Promise.all([
    db.select().from(schema.teams),
    db.select().from(schema.sessions).where(eq(schema.sessions.scheduledDate, today)),
    db.select().from(schema.dailyReports).where(eq(schema.dailyReports.reportDate, today)),
    db.select().from(schema.integrationStatus),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const sheetsStatus = status.find((s) => s.type === "sheets");
  const reportKey = new Map(todayReports.map((r) => [`${r.teamId}:${r.sessionNo}`, r]));

  // 오늘 예정된 (팀+차시) 단위 행 — 같은 팀이 오늘 2차시 이상이면 별도 행
  const rows = todaySessions
    .map((s) => ({
      session: s,
      team: teamMap.get(s.teamId),
      report: reportKey.get(`${s.teamId}:${s.sessionNo}`) ?? null,
    }))
    .filter((r) => r.team)
    .sort((a, b) => (a.team!.name < b.team!.name ? -1 : 1));

  const scheduledTeamCount = new Set(rows.map((r) => r.team!.id)).size;
  const enteredCount = rows.filter((r) => r.report).length;
  const missingCount = rows.length - enteredCount;
  const totalAttended = rows.reduce((s, r) => s + (r.report?.attended ?? 0), 0);
  const totalAbsent = rows.reduce((s, r) => s + (r.report?.absent ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="일일현황"
        description={`오늘(${formatDate(today)}) 수업 예정인 팀만 표시합니다`}
        actions={
          <div className="flex items-center gap-2">
            {canUploadDocument(role) && <ManualEntryButton teams={teams} />}
            {role === "admin" && <DailySyncButton />}
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="오늘 예정 팀" value={scheduledTeamCount} icon={CalendarDays} accent="emerald" />
          <StatCard label="입력 완료" value={enteredCount} icon={CheckCircle2} accent="blue" />
          <StatCard label="미입력" value={missingCount} icon={AlertCircle} accent="amber" />
          <StatCard label="출석/불참 합계" value={`${totalAttended} / ${totalAbsent}`} icon={Users} accent="rose" />
        </div>

        <Card className="p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">구글 스프레드시트 연동</div>
                <div className="text-xs text-muted-foreground">
                  마지막 실행: {sheetsStatus?.lastRunAt ? formatDate(sheetsStatus.lastRunAt) : "—"} ·{" "}
                  상태: {sheetsStatus?.message ?? "비활성"}
                </div>
              </div>
            </div>
            <Badge variant={sheetsStatus?.status === "ok" ? "success" : sheetsStatus?.status === "error" ? "destructive" : "muted"}>
              {sheetsStatus?.status === "ok" ? "정상" :
               sheetsStatus?.status === "error" ? "오류" :
               sheetsStatus?.status === "running" ? "실행중" : "비활성"}
            </Badge>
          </div>
        </Card>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">오늘 예정 ({rows.length}건)</h2>
          {rows.length === 0 && (
            <Card className="p-12 text-center text-muted-foreground">
              오늘 예정된 수업이 없습니다
            </Card>
          )}
          <div className="grid gap-3">
            {rows.map((r) => {
              const reported = r.report;
              const isFullAttend = reported && reported.absent === 0;
              return (
                <Card key={r.session.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{r.team!.cohort}</Badge>
                        <span className="font-medium">{r.team!.name}</span>
                        <span className="text-sm text-muted-foreground">{r.session.sessionNo}차시</span>
                        <span className="text-sm text-muted-foreground">· {reported?.subject || r.session.subject}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(r.session.scheduledDate)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {reported ? (
                        <>
                          {isFullAttend ? (
                            <Badge variant="success">전원출석 {reported.attended}명</Badge>
                          ) : (
                            <>
                              <Badge variant="success">출석 {reported.attended}</Badge>
                              <Badge variant="destructive">불참 {reported.absent}</Badge>
                            </>
                          )}
                          <Badge variant="muted">{reported.source === "sheet" ? "시트" : "수기"}</Badge>
                        </>
                      ) : (
                        <>
                          <Badge variant="destructive">미입력</Badge>
                          {canUploadDocument(role) && (
                            <ManualEntryButton
                              teams={teams}
                              defaultTeamId={r.team!.id}
                              defaultSessionNo={r.session.sessionNo}
                              defaultSubject={r.session.subject}
                              triggerLabel="수기입력"
                              triggerVariant="outline"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {reported?.absentNames && (
                    <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                      불참자: {reported.absentNames}{reported.absentReason ? ` (${reported.absentReason})` : ""}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
