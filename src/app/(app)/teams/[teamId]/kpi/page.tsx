import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Info, Target, User } from "lucide-react";
import { getMemberKpiSummary, getTeamKpiAverage } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import { KpiEditButton } from "./kpi-edit-dialog";
import { getCurrentUser } from "@/lib/auth";

export default async function KpiTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);

  const user = await getCurrentUser();
  const canEdit = user?.role === "admin" || user?.role === "coordinator";

  const teamAvg = await getTeamKpiAverage(tid);
  const members = await db.select().from(schema.members).where(eq(schema.members.teamId, tid));
  const summaries = await Promise.all(members.map((m) => getMemberKpiSummary(m.id, m.name)));

  function colorFor(percent: number) {
    if (percent >= 75) return "bg-emerald-500";
    if (percent >= 50) return "bg-blue-500";
    if (percent >= 25) return "bg-amber-500";
    return "bg-gray-300";
  }

  function badgeFor(percent: number) {
    if (percent >= 75) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (percent >= 50) return "bg-blue-100 text-blue-700 border-blue-200";
    if (percent >= 25) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-gray-100 text-gray-500 border-gray-200";
  }

  const teamAvgFiltered = teamAvg.filter((k) => k.kpiName.startsWith("[기수]"));
  const hasTeamKpi = teamAvgFiltered.length > 0;

  return (
    <div className="space-y-6">
      {/* 팀 공통 KPI */}
      {hasTeamKpi && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">기수 공통 KPI</h2>
            <span className="text-sm text-muted-foreground">— 팀 전체 평균 달성률</span>
          </div>
          <div className="space-y-4">
            {teamAvgFiltered.map((k) => (
              <div key={k.kpiName}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-medium">
                    {k.kpiName.replace("[기수] ", "")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">목표 {k.targetValue}%</span>
                    <span className="text-base font-bold text-emerald-600">{k.teamAvgPercent}%</span>
                  </div>
                </div>
                <Progress value={k.teamAvgPercent} indicatorClassName="bg-emerald-500" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 개인별 KPI */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">개인별 현장과제 KPI</h2>
          {canEdit && (
            <span className="text-xs text-muted-foreground ml-auto">✏️ 클릭하여 달성률 입력</span>
          )}
        </div>

        <div className="space-y-5">
          {summaries.map((s) => {
            // 개인 KPI만 (기수 공통 제외)
            const personalKpis = s.perKpi.filter((k) => !k.kpiName.startsWith("[기수]"));
            const teamKpis = s.perKpi.filter((k) => k.kpiName.startsWith("[기수]"));
            const allKpis = s.perKpi;

            return (
              <div key={s.memberId} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                {/* 멤버 헤더 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* 이니셜 아바타 */}
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {s.name[0]}
                    </div>
                    <div>
                      <span className="font-semibold">{s.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full border font-medium",
                          badgeFor(s.averagePercent)
                        )}>
                          평균 {s.averagePercent}%
                        </span>
                        {/* 중간점검 체크포인트 */}
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3].map((round) => {
                            const done = (allKpis[0]?.checkpointsDone ?? 0) >= round;
                            return (
                              <CheckCircle2
                                key={round}
                                className={cn("h-3.5 w-3.5", done ? "text-emerald-500" : "text-muted-foreground/30")}
                              />
                            );
                          })}
                          <span className="text-xs text-muted-foreground ml-1">중간점검</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 편집 버튼 (관리자/코디만) */}
                  {canEdit && allKpis.length > 0 && (
                    <KpiEditButton
                      memberId={s.memberId}
                      memberName={s.name}
                      kpis={allKpis.map((k) => ({
                        kpiDefId: (k as { kpiDefId?: number }).kpiDefId ?? 0,
                        kpiName: k.kpiName,
                        targetValue: k.targetValue,
                        latest: k.latest,
                        percent: k.percent,
                      }))}
                    />
                  )}
                </div>

                {/* KPI 항목들 */}
                {allKpis.length === 0 ? (
                  <p className="text-sm text-muted-foreground">KPI 정보 없음</p>
                ) : (
                  <div className="space-y-2.5">
                    {/* 개인 현장과제 */}
                    {personalKpis.map((k) => (
                      <div key={k.kpiName}>
                        <div className="flex items-baseline justify-between mb-1 text-sm">
                          <span className="text-foreground/80 truncate max-w-[70%]" title={k.kpiName}>
                            {k.kpiName}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">목표 {k.targetValue}%</span>
                            <span className={cn(
                              "font-bold text-sm",
                              k.percent >= 75 ? "text-emerald-600" :
                              k.percent >= 50 ? "text-blue-600" :
                              k.percent >= 25 ? "text-amber-600" : "text-gray-400"
                            )}>
                              {k.percent}%
                            </span>
                          </div>
                        </div>
                        <Progress value={k.percent} indicatorClassName={colorFor(k.percent)} className="h-2" />
                      </div>
                    ))}

                    {/* 기수 공통 KPI (있을 경우 접어서 표시) */}
                    {teamKpis.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-dashed">
                        {teamKpis.map((k) => (
                          <div key={k.kpiName}>
                            <div className="flex items-baseline justify-between mb-1 text-sm">
                              <span className="text-muted-foreground truncate max-w-[70%] text-xs">
                                공통: {k.kpiName.replace("[기수] ", "")}
                              </span>
                              <span className={cn(
                                "font-medium text-xs",
                                k.percent >= 50 ? "text-emerald-600" : "text-gray-400"
                              )}>
                                {k.percent}%
                              </span>
                            </div>
                            <Progress value={k.percent} indicatorClassName="bg-emerald-400" className="h-1.5" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 범례 */}
      <Card className="p-4 bg-muted/20 border-dashed">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <div className="text-sm font-medium">달성률 기준</div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />75%↑ 우수</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />50~74% 양호</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />25~49% 주의</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />25%↓ 미달</span>
            </div>
            <div className="text-xs text-muted-foreground">
              ✏️ 편집 버튼으로 중간점검 또는 최종 달성률을 입력하세요 (관리자·코디네이터 전용)
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
