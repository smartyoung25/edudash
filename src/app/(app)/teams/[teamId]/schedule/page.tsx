import { db, schema } from "@/db/client";
import { eq, asc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Loader2, Users } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/auth";
import { canManageSessions } from "@/lib/permissions";
import { SessionManager } from "./session-manager";

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
    const isDone = !!rep;
    const isToday = !isDone && s.scheduledDate === today;
    const isPast = !isDone && !isToday && s.scheduledDate < today;
    const state: Row["state"] = isDone ? "done" : isToday ? "today" : isPast ? "past" : "planned";
    const displayNo = isPast ? null : counter++;
    return { ...s, rep, state, displayNo };
  });

  const doneCount = rows.filter((r) => r.state === "done").length;
  const cancelCount = rows.filter((r) => r.state === "past").length;
  const effectiveTotal = sessions.length - cancelCount;
  const total = sessions.length;
  const progressPct = effectiveTotal === 0 ? 0 : Math.round((doneCount / effectiveTotal) * 100);

  if (total === 0) {
    return (
      <div>
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-2">교육 일정</h2>
          <p className="text-sm text-muted-foreground">
            아직 교육 일정이 등록되지 않았습니다{canEdit ? " — 아래에서 회차를 추가하세요." : "."}
          </p>
        </Card>
        {canEdit && <SessionManager teamId={tid} sessions={sessions} />}
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
            <span className="text-muted-foreground"> / {effectiveTotal} 차시 진행</span>
            {cancelCount > 0 && (
              <span className="text-muted-foreground"> · 취소 {cancelCount} (PDF 원래 {total})</span>
            )}
          </div>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="text-xs text-muted-foreground mt-1">
          진행여부는 일일현황(구글 시트) 기록을 기준으로 자동 집계됩니다. 미진행 차시는 번호에서 제외되고 뒤 차시가 자동으로 당겨집니다.
        </div>
      </div>

      <ol className="relative border-l-2 border-muted ml-4 space-y-6">
        {rows.map((r) => {
          const { rep, state, displayNo } = r;
          return (
            <li key={r.id} className="ml-6">
              <span
                className={cn(
                  "absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-background",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "today" && "bg-amber-500 text-white animate-pulse",
                  state === "past" && "bg-rose-500/80 text-white",
                  state === "planned" && "bg-background border-2 border-muted-foreground/30",
                )}
              >
                {state === "done" && <CheckCircle2 className="h-4 w-4" />}
                {state === "today" && <Loader2 className="h-3 w-3 animate-spin" />}
                {state !== "done" && state !== "today" && <Circle className="h-2 w-2 text-transparent" />}
              </span>

              <div className="flex items-center gap-3 flex-wrap">
                {displayNo !== null ? (
                  <Badge variant="outline" className="font-mono">{displayNo}차시</Badge>
                ) : (
                  <Badge variant="outline" className="font-mono opacity-60 line-through">PDF {r.sessionNo}차시</Badge>
                )}
                <span className={cn("font-medium", state === "past" && "text-muted-foreground line-through")}>{r.subject}</span>
                {state === "done" && <Badge variant="success">완료</Badge>}
                {state === "today" && <Badge variant="warning">오늘 예정</Badge>}
                {state === "past" && <Badge variant="destructive">취소(미진행)</Badge>}
                {state === "planned" && <Badge variant="muted">예정</Badge>}
              </div>

              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                {rep ? (
                  rep.reportDate !== r.scheduledDate ? (
                    <>
                      <span className="font-medium text-foreground">{formatDate(rep.reportDate)}</span>
                      <span className="text-xs line-through opacity-60">예정 {formatDate(r.scheduledDate)}</span>
                      <Badge variant="info" className="text-[10px] py-0">일정 변경</Badge>
                    </>
                  ) : (
                    <span>{formatDate(rep.reportDate)}</span>
                  )
                ) : (
                  <span>{formatDate(r.scheduledDate)}</span>
                )}
              </div>

              {rep && (
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-1.5">
                  <Users className="h-3 w-3" />
                  <span>출석 {rep.attended}명 / 불참 {rep.absent}명</span>
                  {rep.absentNames && <span>· 불참자: {rep.absentNames}</span>}
                  {rep.absentReason && <span>· {rep.absentReason}</span>}
                  <span className="ml-auto">{rep.source === "sheet" ? "시트 자동" : "수동"}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
    {canEdit && <SessionManager teamId={tid} sessions={sessions} />}
    </div>
  );
}
