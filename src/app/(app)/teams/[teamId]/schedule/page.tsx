import { db, schema } from "@/db/client";
import { eq, asc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

export default async function ScheduleTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);
  const sessions = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.teamId, tid))
    .orderBy(asc(schema.sessions.sessionNo));

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">교육 일정 (총 {sessions.length}차시)</h2>
      <ol className="relative border-l-2 border-muted ml-4 space-y-6">
        {sessions.map((s) => {
          const isDone = s.status === "done";
          const isInProg = s.status === "in-progress";
          return (
            <li key={s.id} className="ml-6">
              <span
                className={cn(
                  "absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-background",
                  isDone && "bg-emerald-500 text-white",
                  isInProg && "bg-amber-500 text-white animate-pulse",
                  !isDone && !isInProg && "bg-background border-2 border-muted-foreground/30",
                )}
              >
                {isDone && <CheckCircle2 className="h-4 w-4" />}
                {isInProg && <Loader2 className="h-3 w-3 animate-spin" />}
                {!isDone && !isInProg && <Circle className="h-2 w-2 text-transparent" />}
              </span>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="font-mono">{s.sessionNo}차시</Badge>
                <span className="font-medium">{s.subject}</span>
                {isDone && <Badge variant="success">완료</Badge>}
                {isInProg && <Badge variant="warning">진행중</Badge>}
                {!isDone && !isInProg && <Badge variant="muted">예정</Badge>}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{formatDate(s.scheduledDate)}</div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
