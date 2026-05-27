// 기존 대시보드 — coordinator/professor가 PR3 전용 뷰로 교체되기 전까지 사용.
import { db, schema } from "@/db/client";
import { getAllTeamProgress, getDashboardSummary } from "@/lib/kpi";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Users, Briefcase, TrendingUp } from "lucide-react";
import { DashboardClient } from "../dashboard-client";
import type { Product } from "@/lib/teams";

export async function LegacyDashboard() {
  const [teams, summary, progressMap] = await Promise.all([
    db.select().from(schema.teams),
    getDashboardSummary(),
    getAllTeamProgress(),
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

  return (
    <div>
      <PageHeader title="대시보드" description={`${teams.length}개 팀의 운영 현황`} />
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="운영 팀" value={summary.totalTeams} hint="6개 품목" icon={Briefcase} accent="emerald" />
          <StatCard label="총 교육생" value={summary.totalMembers} hint="전체 등록 인원" icon={Users} accent="blue" />
          <StatCard label="평균 진행률" value={`${summary.avgProgress}%`} hint="완료 차시 기준" icon={TrendingUp} accent="amber" />
        </div>
        <DashboardClient teams={cards} />
      </div>
    </div>
  );
}
