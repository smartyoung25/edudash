/**
 * 대시보드 위험·액션 메트릭 집계.
 *
 * - `kpi.ts`는 진행률 도메인 유지, 본 모듈은 재정·보고누락·마감 등 복합 위험을 조합.
 * - role별 view에서 동일 함수를 호출하지만 `opts.teamIds`로 범위를 좁힘.
 */

import { db, schema } from "@/db/client";
import { and, eq, gte, lte, inArray, isNull, or, sql } from "drizzle-orm";
import { getAllTeamProgress, type TeamProgress } from "./kpi";

export type RiskLevel = "low" | "mid" | "high";

export interface MetricsOpts {
  /** 대상 팀 범위 (코디/주임교수 한정). undefined면 전체. */
  teamIds?: number[];
}

function inScope<T extends { teamId?: number; id?: number }>(rows: T[], teamIds?: number[], key: "teamId" | "id" = "teamId"): T[] {
  if (!teamIds) return rows;
  const set = new Set(teamIds);
  return rows.filter((r) => set.has((r as any)[key]));
}

/** 로컬 타임존에서 YYYY-MM-DD 포맷 (toISOString의 UTC 변환을 회피). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function thisWeekRange(today = new Date()): { start: string; end: string } {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: localDateStr(monday), end: localDateStr(sunday) };
}

export function mondayOf(date: string | Date): string {
  // 문자열 "YYYY-MM-DD"는 UTC로 파싱되므로 로컬 컴포넌트로 재구성
  let d: Date;
  if (typeof date === "string") {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
  } else {
    d = new Date(date);
  }
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + offset);
  return localDateStr(d);
}

// ───────── 이번 주 일일보고 누락 ─────────

export interface MissingReportRow {
  teamId: number;
  teamName: string;
  sessionNo: number;
  scheduledDate: string;
}

export async function getMissingReportsThisWeek(opts: MetricsOpts = {}): Promise<MissingReportRow[]> {
  const { start, end } = thisWeekRange();
  const today = new Date().toISOString().slice(0, 10);

  const teams = await db.select().from(schema.teams);
  const sessionRows = inScope(
    await db.select().from(schema.sessions).where(and(gte(schema.sessions.scheduledDate, start), lte(schema.sessions.scheduledDate, end))),
    opts.teamIds,
  );
  const reports = await db.select({ teamId: schema.dailyReports.teamId, sessionNo: schema.dailyReports.sessionNo }).from(schema.dailyReports);
  const reportKey = new Set(reports.map((r) => `${r.teamId}#${r.sessionNo}`));

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const out: MissingReportRow[] = [];
  for (const s of sessionRows) {
    if (s.scheduledDate > today) continue; // 미래는 아직 누락 아님
    if (reportKey.has(`${s.teamId}#${s.sessionNo}`)) continue;
    out.push({ teamId: s.teamId, teamName: teamNameById.get(s.teamId) ?? `팀${s.teamId}`, sessionNo: s.sessionNo, scheduledDate: s.scheduledDate });
  }
  return out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

// ───────── 카드대사 미매칭 ─────────

export async function getUnmatchedCardCount(): Promise<number> {
  const rows = await db.select({ id: schema.cardStatements.id }).from(schema.cardStatements)
    .where(and(isNull(schema.cardStatements.matchedExpenseId), isNull(schema.cardStatements.matchedAgencyExpenseId)));
  return rows.length;
}

// ───────── 예산 초과 위험 팀 (≥80% 소진) ─────────

export interface BudgetRiskRow {
  teamId: number;
  teamName: string;
  category: string;
  budget: number;
  spent: number;
  ratio: number; // 0~∞ — 1.0=완전 소진
}

export async function getBudgetRiskTeams(opts: MetricsOpts = {}, threshold = 0.8): Promise<BudgetRiskRow[]> {
  const teams = await db.select().from(schema.teams);
  const budgets = inScope(await db.select().from(schema.expenseBudgets), opts.teamIds);
  const expenses = inScope(await db.select().from(schema.expenses), opts.teamIds);

  const spentByKey = new Map<string, number>();
  for (const e of expenses) {
    const k = `${e.teamId}#${e.category}`;
    spentByKey.set(k, (spentByKey.get(k) ?? 0) + (e.totalAmount ?? 0));
  }
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const out: BudgetRiskRow[] = [];
  for (const b of budgets) {
    if (b.amount <= 0) continue;
    const spent = spentByKey.get(`${b.teamId}#${b.category}`) ?? 0;
    const ratio = spent / b.amount;
    if (ratio >= threshold) {
      out.push({ teamId: b.teamId, teamName: teamNameById.get(b.teamId) ?? `팀${b.teamId}`, category: b.category, budget: b.amount, spent, ratio });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

// ───────── 마감 임박 팀 ─────────

export interface DeadlineRow {
  teamId: number;
  teamName: string;
  endDate: string;
  daysLeft: number;
  progressPercent: number;
}

export async function getApproachingDeadlines(opts: MetricsOpts = {}, withinDays = 14): Promise<DeadlineRow[]> {
  const teams = inScope(await db.select().from(schema.teams), opts.teamIds, "id");
  const progresses = await getAllTeamProgress();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out: DeadlineRow[] = [];
  for (const t of teams) {
    const end = new Date(t.endDate);
    if (isNaN(end.getTime())) continue;
    const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (daysLeft < 0 || daysLeft > withinDays) continue;
    out.push({ teamId: t.id, teamName: t.name, endDate: t.endDate, daysLeft, progressPercent: progresses[t.id]?.progressPercent ?? 0 });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ───────── 위험도 점수 + 액션 큐 ─────────

export interface RiskyTeamRow {
  teamId: number;
  teamName: string;
  product: string;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  progressPercent: number;
}

/**
 * 위험 가중치:
 *   진행률 지연(scheduledDate 지났는데 미보고) +3
 *   이번 주 보고 누락          +2
 *   예산 ≥80% 소진             +2
 *   카드 매입 매칭 없음(팀별)  +1
 *   마감 ≤14일 + 진행률 <80%   +1
 */
export function computeRiskScore(parts: { overdueReports: number; weekMisses: number; budgetHits: number; cardMisses: number; deadlineSoon: boolean }): { score: number; level: RiskLevel } {
  const score = parts.overdueReports * 3 + parts.weekMisses * 2 + parts.budgetHits * 2 + parts.cardMisses * 1 + (parts.deadlineSoon ? 1 : 0);
  const level: RiskLevel = score >= 6 ? "high" : score >= 3 ? "mid" : "low";
  return { score, level };
}

export async function getRiskyTeams(opts: MetricsOpts = {}): Promise<RiskyTeamRow[]> {
  const teams = inScope(await db.select().from(schema.teams), opts.teamIds, "id");
  const progresses = await getAllTeamProgress();
  const weekMisses = await getMissingReportsThisWeek(opts);
  const budgets = await getBudgetRiskTeams(opts);
  const deadlines = await getApproachingDeadlines(opts);

  const weekMissByTeam = new Map<number, number>();
  for (const m of weekMisses) weekMissByTeam.set(m.teamId, (weekMissByTeam.get(m.teamId) ?? 0) + 1);
  const budgetHitsByTeam = new Map<number, number>();
  for (const b of budgets) budgetHitsByTeam.set(b.teamId, (budgetHitsByTeam.get(b.teamId) ?? 0) + 1);
  const deadlineByTeam = new Map<number, DeadlineRow>();
  for (const d of deadlines) deadlineByTeam.set(d.teamId, d);

  // 진행률 지연 (지난 차시인데 미보고) — TeamProgress.cancelled가 곧 그 카운트
  const out: RiskyTeamRow[] = [];
  for (const t of teams) {
    const p: TeamProgress | undefined = progresses[t.id];
    if (!p) continue;
    const overdueReports = p.cancelled;
    const weekMissCount = weekMissByTeam.get(t.id) ?? 0;
    const budgetHits = budgetHitsByTeam.get(t.id) ?? 0;
    const d = deadlineByTeam.get(t.id);
    const deadlineSoon = !!d && p.progressPercent < 80;
    const { score, level } = computeRiskScore({
      overdueReports, weekMisses: weekMissCount, budgetHits, cardMisses: 0, deadlineSoon,
    });
    if (score === 0) continue;
    const reasons: string[] = [];
    if (overdueReports) reasons.push(`지난 차시 ${overdueReports}건 미보고`);
    if (weekMissCount) reasons.push(`이번 주 ${weekMissCount}건 보고 누락`);
    if (budgetHits) reasons.push(`예산 위험 ${budgetHits}개 카테고리`);
    if (deadlineSoon) reasons.push(`마감 D-${d!.daysLeft}, 진행 ${p.progressPercent}%`);
    out.push({
      teamId: t.id, teamName: t.name, product: t.product,
      riskScore: score, riskLevel: level, reasons,
      progressPercent: p.progressPercent,
    });
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
}

// ───────── 종합 ─────────

export interface DashboardMetrics {
  ongoingTeams: number;
  totalTeams: number;
  avgProgress: number;
  avgProgressDelta: number | null;  // 전주 대비 변화량 (pp). 스냅샷 없으면 null.
  missingReports: number;
  unmatchedCards: number;
  budgetRiskTeams: number;
  approachingDeadlines: number;
  risky: RiskyTeamRow[];
  /** KPI 카드 클릭 시 단일 팀일 때 deep-link 가능하도록 첫 대상 팀 id를 함께 노출. */
  firstTeamIds: {
    missingReport: number | null;
    budgetRisk: number | null;
    approachingDeadline: number | null;
  };
}

export async function getDashboardMetrics(opts: MetricsOpts = {}): Promise<DashboardMetrics> {
  const teams = inScope(await db.select().from(schema.teams), opts.teamIds, "id");
  const today = new Date().toISOString().slice(0, 10);
  const ongoingTeams = teams.filter((t) => t.endDate >= today).length;

  const progresses = await getAllTeamProgress();
  const scoped = teams.map((t) => progresses[t.id]).filter(Boolean);
  const avg = scoped.length === 0 ? 0 : Math.round(scoped.reduce((s, p) => s + p.progressPercent, 0) / scoped.length);

  // 전주 대비 — 스냅샷 테이블 조회
  let avgProgressDelta: number | null = null;
  const lastMonday = new Date(); lastMonday.setDate(lastMonday.getDate() - 7);
  const lastWeekStart = mondayOf(lastMonday);
  const snaps = await db.select().from(schema.progressSnapshots).where(eq(schema.progressSnapshots.weekStart, lastWeekStart));
  const scopedSnaps = inScope(snaps, opts.teamIds);
  if (scopedSnaps.length > 0) {
    const prevAvg = Math.round(scopedSnaps.reduce((s, r) => s + r.progressPercent, 0) / scopedSnaps.length);
    avgProgressDelta = avg - prevAvg;
  }

  const [missing, unmatched, budgets, deadlines, risky] = await Promise.all([
    getMissingReportsThisWeek(opts),
    opts.teamIds ? Promise.resolve(0) : getUnmatchedCardCount(),
    getBudgetRiskTeams(opts),
    getApproachingDeadlines(opts),
    getRiskyTeams(opts),
  ]);

  return {
    ongoingTeams, totalTeams: teams.length,
    avgProgress: avg, avgProgressDelta,
    missingReports: missing.length,
    unmatchedCards: unmatched,
    budgetRiskTeams: new Set(budgets.map((b) => b.teamId)).size,
    approachingDeadlines: deadlines.length,
    risky,
    firstTeamIds: {
      missingReport: missing[0]?.teamId ?? null,
      budgetRisk: budgets[0]?.teamId ?? null,
      approachingDeadline: deadlines[0]?.teamId ?? null,
    },
  };
}

// ───────── 주간 스냅샷 적재 ─────────

export async function snapshotProgressForThisWeek(): Promise<{ inserted: number; updated: number }> {
  const weekStart = mondayOf(new Date());
  const progresses = await getAllTeamProgress();
  const teamIds = Object.keys(progresses).map(Number);
  let inserted = 0, updated = 0;
  for (const teamId of teamIds) {
    const p = progresses[teamId];
    const existing = await db.select().from(schema.progressSnapshots)
      .where(and(eq(schema.progressSnapshots.teamId, teamId), eq(schema.progressSnapshots.weekStart, weekStart)))
      .limit(1);
    if (existing[0]) {
      await db.update(schema.progressSnapshots)
        .set({ progressPercent: p.progressPercent, snapshotAt: new Date().toISOString() })
        .where(eq(schema.progressSnapshots.id, existing[0].id));
      updated++;
    } else {
      await db.insert(schema.progressSnapshots).values({ teamId, weekStart, progressPercent: p.progressPercent });
      inserted++;
    }
  }
  return { inserted, updated };
}
