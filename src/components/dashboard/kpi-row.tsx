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
  // KPI별 deep-link 매핑.
  // - 0건이면 클릭할 필요 없음 → href=null
  // - 1팀이면 해당 팀 deep-link
  // - 2팀 이상이면 첫 위험 팀으로 보내고, 액션 큐가 우측에 있으니 거기서 다음 팀을 고를 수 있게 함
  const href = {
    teams: "/teams",
    missing: m.firstTeamIds.missingReport
      ? `/teams/${m.firstTeamIds.missingReport}/schedule`
      : null,
    cards: m.unmatchedCards > 0 ? "/expenses/reconcile" : null,
    budget: m.firstTeamIds.budgetRisk
      ? `/expenses/${m.firstTeamIds.budgetRisk}`
      : null,
    deadline: m.firstTeamIds.approachingDeadline
      ? `/teams/${m.firstTeamIds.approachingDeadline}`
      : null,
  };

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="진행 중 팀" value={`${m.ongoingTeams}/${m.totalTeams}`} hint="종료일 미도래"
        icon={Briefcase} accent="emerald" href={href.teams} />
      <StatCard label="평균 진행률" value={`${m.avgProgress}%`} hint="전주 대비"
        icon={TrendingUp} accent="blue"
        delta={m.avgProgressDelta}
        sparkline={sparklines?.avgProgress} />
      <StatCard label="이번 주 보고 누락" value={m.missingReports} hint={hintForCount(m.missingReports, "강사 일일보고")}
        icon={ClipboardX} accent="rose" href={href.missing} />
      <StatCard label="카드 미매칭" value={m.unmatchedCards} hint="영수증 없는 카드 매입"
        icon={CreditCard} accent="amber" href={href.cards} />
      <StatCard label="예산 위험 팀" value={m.budgetRiskTeams} hint={hintForCount(m.budgetRiskTeams, "≥80% 소진")}
        icon={AlertTriangle} accent="orange" href={href.budget} />
      <StatCard label="마감 임박" value={m.approachingDeadlines} hint={hintForCount(m.approachingDeadlines, "D-14 이내")}
        icon={CalendarClock} accent="violet" href={href.deadline} />
    </div>
  );
}

/** 0건이면 단순 안내, 1건이면 "팀 바로가기", 2건 이상이면 첫 팀 + 나머지 갯수 안내. */
function hintForCount(count: number, baseHint: string): string {
  if (count === 0) return baseHint;
  if (count === 1) return `${baseHint} · 팀 바로가기`;
  return `${baseHint} · 첫 팀 바로가기`;
}
