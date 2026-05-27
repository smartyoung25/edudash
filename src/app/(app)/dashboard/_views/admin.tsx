import { db, schema } from "@/db/client";
import { getAllTeamProgress } from "@/lib/kpi";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { getProgressTrendByWeek, getProgressByProduct } from "@/lib/dashboard-trend";
import { PageHeader } from "@/components/page-header";
import { HeroBar } from "@/components/dashboard/hero-bar";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TrendCard } from "@/components/dashboard/trend-card";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { DashboardClient } from "../dashboard-client";
import type { Product } from "@/lib/teams";

export async function AdminDashboard({ userName }: { userName: string }) {
  const [teams, progressMap, metrics, trend, byProduct] = await Promise.all([
    db.select().from(schema.teams),
    getAllTeamProgress(),
    getDashboardMetrics(),
    getProgressTrendByWeek(8),
    getProgressByProduct(),
  ]);

  const cards = teams.map((t) => ({
    id: t.id,
    name: t.name,
    product: t.product as Product,
    cohort: t.cohort,
    courseName: t.courseName,
    region: t.region,
    headCount: t.headCount,
    totalSessions: progressMap[t.id]?.effectiveTotal ?? t.totalSessions,
    endDate: t.endDate,
    professorName: t.professorName,
    currentSession: progressMap[t.id]?.done ?? 0,
    progressPercent: progressMap[t.id]?.progressPercent ?? 0,
    cancelled: progressMap[t.id]?.cancelled ?? 0,
  }));

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
        <DashboardClient teams={cards} />
      </div>
    </div>
  );
}
