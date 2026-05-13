import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Info } from "lucide-react";
import { getMemberKpiSummary, getTeamKpiAverage } from "@/lib/kpi";
import { cn } from "@/lib/utils";

export default async function KpiTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);
  const teamAvg = await getTeamKpiAverage(tid);
  const members = await db.select().from(schema.members).where(eq(schema.members.teamId, tid));
  const summaries = await Promise.all(members.map((m) => getMemberKpiSummary(m.id, m.name)));

  function bgFor(percent: number) {
    if (percent >= 50) return "bg-emerald-500";
    if (percent >= 25) return "bg-amber-500";
    return "bg-gray-400";
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">팀 공통 KPI</h2>
        <p className="text-sm text-muted-foreground mb-4">팀 전체 KPI 목표 대비 평균 진도율</p>
        <div className="space-y-4">
          {teamAvg.map((k) => (
            <div key={k.kpiName}>
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <span className="font-medium">{k.kpiName}</span>
                  <span className="text-xs text-muted-foreground ml-2">목표 {k.targetValue}%</span>
                </div>
                <span className="text-lg font-bold text-emerald-600">{k.teamAvgPercent}%</span>
              </div>
              <Progress value={k.teamAvgPercent} indicatorClassName="bg-emerald-500" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">개인별 KPI 진도율</h2>
        <p className="text-sm text-muted-foreground mb-4">중간점검 3회 진행 (체크포인트 표시)</p>
        <div className="space-y-4">
          {summaries.map((s) => (
            <div key={s.memberId} className="border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">평균 {s.averagePercent}%</span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((round) => {
                    const done = (s.perKpi[0]?.checkpointsDone ?? 0) >= round;
                    return (
                      <CheckCircle2
                        key={round}
                        className={cn("h-4 w-4", done ? "text-emerald-500" : "text-muted-foreground/30")}
                      />
                    );
                  })}
                  <span className="text-xs text-muted-foreground ml-1">중간점검</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {s.perKpi.map((k) => (
                  <div key={k.kpiName} className="space-y-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground truncate">{k.kpiName}</span>
                      <span className="font-mono">{k.percent}%</span>
                    </div>
                    <Progress value={k.percent} indicatorClassName={bgFor(k.percent)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 bg-muted/20 border-dashed">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <div className="text-sm font-medium">KPI 평가 방식</div>
            <div className="text-sm text-muted-foreground">
              사전 목표 설정 → 중간점검(3~5회) 진도율 업데이트 → 사후 달성값 최종 기록
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />50%↑</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />25~49%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />25%↓</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
