import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getMemberKpiSummary } from "@/lib/kpi";
import { cn } from "@/lib/utils";

export default async function MembersTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);
  const members = await db.select().from(schema.members).where(eq(schema.members.teamId, tid));
  const summaries = await Promise.all(members.map((m) => getMemberKpiSummary(m.id, m.name)));

  function bgFor(percent: number) {
    if (percent >= 50) return "bg-emerald-500";
    if (percent >= 25) return "bg-amber-500";
    return "bg-gray-400";
  }
  function colorFor(percent: number) {
    if (percent >= 50) return "text-emerald-600";
    if (percent >= 25) return "text-amber-600";
    return "text-gray-500";
  }
  function avatarColor(name: string) {
    const colors = ["bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700"];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[h];
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">{members.length}명의 교육생 · 개인별 KPI 평균 진도율</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaries.map((s) => (
          <Card key={s.memberId} className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={cn("h-10 w-10 rounded-full flex items-center justify-center font-semibold text-sm", avatarColor(s.name))}>
                {s.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.name}</div>
                <div className={cn("text-xs", colorFor(s.averagePercent))}>KPI 평균 {s.averagePercent}%</div>
              </div>
            </div>
            <Progress value={s.averagePercent} indicatorClassName={bgFor(s.averagePercent)} />
          </Card>
        ))}
      </div>
    </div>
  );
}
