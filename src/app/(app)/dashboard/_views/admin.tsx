import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { getProgressTrendByWeek, getProgressByProduct } from "@/lib/dashboard-trend";
import { PageHeader } from "@/components/page-header";
import { HeroBar } from "@/components/dashboard/hero-bar";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TrendCard } from "@/components/dashboard/trend-card";
import { ActionQueue } from "@/components/dashboard/action-queue";

export async function AdminDashboard({ userName }: { userName: string }) {
  const [metrics, trend, byProduct] = await Promise.all([
    getDashboardMetrics(),
    getProgressTrendByWeek(8),
    getProgressByProduct(),
  ]);

  const topRisk = metrics.risky[0];
  const riskSummary = topRisk
    ? `${topRisk.teamName} ${topRisk.reasons[0]} 외 ${metrics.risky.length - 1}건`
    : null;

  return (
    <div>
      <PageHeader
        title="대시보드"
        description={`2026 성장농 맞춤형과정 ${metrics.totalTeams}개 팀 · 평균 진행 ${metrics.avgProgress}%`}
      />
      <div className="p-6 space-y-5">
        <HeroBar greeting={`${userName}님, 오늘의 운영 현황입니다.`} riskSummary={riskSummary} />
        <KpiRow m={metrics} sparklines={{ avgProgress: trend.map((p) => p.avgProgress) }} />
        <div className="grid gap-4 lg:grid-cols-12">
          <TrendCard className="lg:col-span-8 order-2 lg:order-1" trend={trend} byProduct={byProduct} />
          <ActionQueue className="lg:col-span-4 order-1 lg:order-2" rows={metrics.risky.slice(0, 12)} />
        </div>
      </div>
    </div>
  );
}
