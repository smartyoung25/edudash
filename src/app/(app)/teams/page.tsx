import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";
import { db, schema } from "@/db/client";
import { getAllTeamProgress } from "@/lib/kpi";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { PageHeader } from "@/components/page-header";
import { DashboardClient } from "../dashboard/dashboard-client";
import type { Product } from "@/lib/teams";

export const dynamic = "force-dynamic";

export default async function TeamsIndex() {
  const session = await requireAuth();

  // 코디/주임교수는 본인 팀 상세로 즉시 이동
  if (isTeamScoped(session.role!)) {
    if (session.teamId) redirect(`/teams/${session.teamId}`);
    return (
      <div className="p-6">
        <PageHeader title="팀별 운영현황" description="배정된 팀이 없습니다." />
      </div>
    );
  }

  // 어드민: 전체 팀 카드 그리드
  const [teams, progressMap, metrics] = await Promise.all([
    db.select().from(schema.teams),
    getAllTeamProgress(),
    getDashboardMetrics(),
  ]);

  const riskById = new Map(metrics.risky.map((r) => [r.teamId, r.riskLevel]));
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
    risk: riskById.get(t.id),
  }));
  // 위험팀 우선 정렬: high → mid → 진행률 낮은 순
  const rank = (r: "high" | "mid" | "low" | undefined) => (r === "high" ? 0 : r === "mid" ? 1 : 2);
  cards.sort((a, b) => rank(a.risk) - rank(b.risk) || a.progressPercent - b.progressPercent);

  return (
    <div>
      <PageHeader title="팀별 운영현황" description={`총 ${cards.length}개 팀 · 품목별 필터 가능`} />
      <div className="p-6">
        <DashboardClient teams={cards} />
      </div>
    </div>
  );
}
