// Coordinator / Professor 공통 — session.teamId 한 팀에 한정된 대시보드.
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getAllTeamProgress } from "@/lib/kpi";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { getProgressTrendByWeek } from "@/lib/dashboard-trend";
import { PageHeader } from "@/components/page-header";
import { HeroBar } from "@/components/dashboard/hero-bar";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { TrendCard } from "@/components/dashboard/trend-card";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { TeamCard, type TeamCardData } from "@/components/team-card";
import type { Product } from "@/lib/teams";

export async function ScopedDashboard({
  userName, teamId, roleLabel,
}: {
  userName: string;
  teamId: number;
  roleLabel: "코디네이터" | "주임교수";
}) {
  const [team, progressMap, metrics, trend] = await Promise.all([
    db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1).then((r) => r[0]),
    getAllTeamProgress(),
    getDashboardMetrics({ teamIds: [teamId] }),
    getProgressTrendByWeek(8, [teamId]),
  ]);

  if (!team) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        담당팀이 지정되어 있지 않습니다. 관리자에게 문의하세요.
      </div>
    );
  }

  const p = progressMap[team.id];
  const card: TeamCardData = {
    id: team.id,
    name: team.name,
    product: team.product as Product,
    cohort: team.cohort,
    courseName: team.courseName,
    region: team.region,
    headCount: team.headCount,
    totalSessions: p?.effectiveTotal ?? team.totalSessions,
    endDate: team.endDate,
    professorName: team.professorName,
    currentSession: p?.done ?? 0,
    progressPercent: p?.progressPercent ?? 0,
    cancelled: p?.cancelled ?? 0,
    risk: metrics.risky[0]?.riskLevel,
  };

  const topRisk = metrics.risky[0];
  const riskSummary = topRisk ? topRisk.reasons.join(" · ") : null;

  return (
    <div>
      <PageHeader
        title="대시보드"
        description={`${team.name} · ${roleLabel} 화면`}
      />
      <div className="p-6 space-y-5">
        <HeroBar greeting={`${userName}님, ${team.name} 현황입니다.`} riskSummary={riskSummary} />
        <KpiRow m={metrics} sparklines={{ avgProgress: trend.map((t) => t.avgProgress) }} />
        <div className="grid gap-4 lg:grid-cols-12">
          <TrendCard className="lg:col-span-8 order-2 lg:order-1" trend={trend} byProduct={[]} />
          <ActionQueue className="lg:col-span-4 order-1 lg:order-2" rows={metrics.risky} />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <TeamCard team={card} />
        </div>
      </div>
    </div>
  );
}
