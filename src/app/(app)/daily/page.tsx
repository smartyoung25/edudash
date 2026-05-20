import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, UserX, AlertCircle, RefreshCw } from "lucide-react";
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
  const reports = await db.select().from(schema.dailyReports).orderBy(desc(schema.dailyReports.reportDate)).limit(50);
  const teams = await db.select().from(schema.teams);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const status = await db.select().from(schema.integrationStatus);
  const sheetsStatus = status.find((s) => s.type === "sheets");

  // 오늘 기준 통계
  const today = new Date().toISOString().slice(0, 10);
  const todayReports = reports.filter((r) => r.reportDate === today);
  const totalAttended = todayReports.reduce((s, r) => s + r.attended, 0);
  const totalAbsent = todayReports.reduce((s, r) => s + r.absent, 0);
  const todayTeamIds = new Set(todayReports.map((r) => r.teamId));
  const noEntry = teams.length - todayTeamIds.size;

  return (
    <div>
      <PageHeader
        title="일일현황"
        description="구글 스프레드시트 연동 또는 수동 입력으로 일일 출석 현황을 관리합니다"
        actions={
          <div className="flex items-center gap-2">
            {canUploadDocument(role) && <ManualEntryButton teams={teams} />}
            {role === "admin" && <DailySyncButton />}
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="오늘 수업 팀" value={todayReports.length} icon={CalendarDays} accent="emerald" />
          <StatCard label="오늘 출석" value={`${totalAttended}명`} icon={Users} accent="blue" />
          <StatCard label="오늘 불참" value={`${totalAbsent}명`} icon={UserX} accent="rose" />
          <StatCard label="미입력 팀" value={noEntry} icon={AlertCircle} accent="amber" />
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
          <h2 className="text-lg font-semibold">최근 일일현황 ({reports.length}건)</h2>
          {reports.length === 0 && (
            <Card className="p-12 text-center text-muted-foreground">
              아직 기록된 일일현황이 없습니다
            </Card>
          )}
          <div className="grid gap-3">
            {reports.map((r) => {
              const team = teamMap.get(r.teamId);
              const isFullAttend = r.absent === 0;
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{team?.cohort}</Badge>
                        <span className="font-medium">{team?.name}</span>
                        <span className="text-sm text-muted-foreground">{r.sessionNo}차시</span>
                        <span className="text-sm text-muted-foreground">· {r.subject}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(r.reportDate)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isFullAttend ? (
                        <Badge variant="success">전원출석 {r.attended}명</Badge>
                      ) : (
                        <>
                          <Badge variant="success">출석 {r.attended}</Badge>
                          <Badge variant="destructive">불참 {r.absent}</Badge>
                        </>
                      )}
                      <Badge variant="muted">{r.source === "sheet" ? "시트" : "수기"}</Badge>
                    </div>
                  </div>
                  {r.absentNames && (
                    <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                      불참자: {r.absentNames} ({r.absentReason})
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
