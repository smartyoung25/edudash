import { db, schema } from "@/db/client";
import { eq, asc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireAuth } from "@/lib/auth";
import { canManageSessions } from "@/lib/permissions";
import { ScheduleTimeline } from "./schedule-timeline";

export default async function ScheduleTab({ params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId } = await params;
  const tid = Number(teamId);
  const canEdit = canManageSessions(session.role!);

  const [sessions, reports] = await Promise.all([
    db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.teamId, tid))
      .orderBy(asc(schema.sessions.sessionNo)),
    db
      .select()
      .from(schema.dailyReports)
      .where(eq(schema.dailyReports.teamId, tid)),
  ]);

  // daily_reports(시트/수동 입력) 기준으로 진행여부 판정 — session_no 매칭
  const reportByNo = new Map(reports.map((r) => [r.sessionNo, r] as const));
  const today = new Date().toISOString().slice(0, 10);

  // 표시 차시 번호 재계산: 미진행(과거 일자에 시트 기록 없음)은 "취소"로 처리하고 번호를 차지하지 않음
  // → 실제 진행/예정된 차시들만 1, 2, 3... 순서대로 다시 매김
  type Row = (typeof sessions)[number] & {
    displayNo: number | null; // null이면 취소
    rep: (typeof reports)[number] | undefined;
    state: "done" | "today" | "past" | "planned";
  };
  let counter = 1;
  const rows: Row[] = sessions.map((s) => {
    const rep = reportByNo.get(s.sessionNo);
    const isDone = !!rep || s.status === "done";
    const isToday = !isDone && s.scheduledDate === today;
    const isPast = !isDone && !isToday && s.scheduledDate < today;
    const state: Row["state"] = isDone ? "done" : isToday ? "today" : isPast ? "past" : "planned";
    const displayNo = isPast ? null : counter++;
    return { ...s, rep, state, displayNo };
  });

  const doneCount = rows.filter((r) => r.state === "done").length;
  const cancelCount = rows.filter((r) => r.state === "past").length;
  const total = sessions.length;
  const progressPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  if (total === 0) {
    return (
      <div>
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-2">교육 일정</h2>
          <p className="text-sm text-muted-foreground mb-4">
            아직 교육 일정이 등록되지 않았습니다{canEdit ? " — 아래에서 회차를 추가하세요." : "."}
          </p>
          <ScheduleTimeline teamId={tid} rows={rows} canEdit={canEdit} />
        </Card>
      </div>
    );
  }

  return (
    <div>
    <Card className="p-6">
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-lg font-semibold">교육 일정</h2>
          <div className="text-sm">
            <span className="text-2xl font-bold text-primary">{doneCount}</span>
            <span className="text-muted-foreground"> / {total} 차시 진행</span>
            {cancelCount > 0 && (
              <span className="text-muted-foreground"> · 취소(미진행) {cancelCount}</span>
            )}
          </div>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="text-xs text-muted-foreground mt-1">
          진행여부는 일일현황(구글 시트) 기록을 기준으로 자동 집계됩니다. 미진행 차시는 번호에서 제외되고 뒤 차시가 자동으로 당겨집니다.
        </div>
      </div>

      <ScheduleTimeline teamId={tid} rows={rows} canEdit={canEdit} />
    </Card>
    </div>
  );
}
