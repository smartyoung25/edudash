import { Briefcase, TrendingUp, ClipboardX, CreditCard, AlertTriangle, CalendarClock } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { DashboardMetrics } from "@/lib/dashboard-metrics";

export function KpiRow({
  m,
  sparklines,
}: {
  m: DashboardMetrics;
  /** 진행률 추세 라인을 진행률 카드 스파크라인으로 재사용. */
  sparklines?: { avgProgress?: number[] };
}) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="진행 중 팀" value={`${m.ongoingTeams}/${m.totalTeams}`} hint="종료일 미도래"
        icon={Briefcase} accent="emerald" />
      <StatCard label="평균 진행률" value={`${m.avgProgress}%`} hint="전주 대비"
        icon={TrendingUp} accent="blue"
        delta={m.avgProgressDelta}
        sparkline={sparklines?.avgProgress} />
      <StatCard label="이번 주 보고 누락" value={m.missingReports} hint="강사 일일보고"
        icon={ClipboardX} accent="rose" />
      <StatCard label="카드 미매칭" value={m.unmatchedCards} hint="영수증 없는 카드 매입"
        icon={CreditCard} accent="amber" />
      <StatCard label="예산 위험 팀" value={m.budgetRiskTeams} hint="≥80% 소진"
        icon={AlertTriangle} accent="orange" />
      <StatCard label="마감 임박" value={m.approachingDeadlines} hint="D-14 이내"
        icon={CalendarClock} accent="violet" />
    </div>
  );
}
