import { db, schema } from "@/db/client";
import { eq, and, sql, inArray } from "drizzle-orm";

export interface TeamProgress {
  teamId: number;
  total: number;            // PDF 원래 차시 수
  effectiveTotal: number;   // 미진행(취소) 제외한 유효 차시 수
  done: number;             // 일일현황 기록 있는 차시 (실제 진행됨)
  cancelled: number;        // 과거 일자에 기록 없음 = 미진행
  planned: number;          // 미래 예정 차시 수
  progressPercent: number;  // done / effectiveTotal
  currentSession: number;   // 다음 진행할 차시(표시번호) — 끝났으면 effectiveTotal
}

// 진행률 = 일일현황(daily_reports) 기록 기준
// 일정 페이지(teams/[id]/schedule)와 동일한 규칙을 사용
export async function getTeamProgress(teamId: number): Promise<TeamProgress> {
  const [sessions, reports] = await Promise.all([
    db.select().from(schema.sessions).where(eq(schema.sessions.teamId, teamId)),
    db.select().from(schema.dailyReports).where(eq(schema.dailyReports.teamId, teamId)),
  ]);
  return computeProgress(teamId, sessions, reports);
}

function computeProgress(
  teamId: number,
  sessions: (typeof schema.sessions.$inferSelect)[],
  reports: (typeof schema.dailyReports.$inferSelect)[],
): TeamProgress {
  const today = new Date().toISOString().slice(0, 10);
  const reportNos = new Set(reports.map((r) => r.sessionNo));
  let done = 0, cancelled = 0, planned = 0;
  for (const s of sessions) {
    if (reportNos.has(s.sessionNo) || s.status === "done") done++;
    else if (s.scheduledDate < today) cancelled++;
    else planned++;
  }
  const total = sessions.length;
  const effectiveTotal = total - cancelled;
  const progressPercent = effectiveTotal === 0 ? 0 : Math.round((done / effectiveTotal) * 100);
  const currentSession = Math.min(done + 1, effectiveTotal === 0 ? 1 : effectiveTotal);
  return { teamId, total, effectiveTotal, done, cancelled, planned, progressPercent, currentSession };
}

export async function getAllTeamProgress(): Promise<Record<number, TeamProgress>> {
  // 한 쿼리로 전체 데이터를 가져와 in-memory 계산 (N+1 회피)
  const [teams, allSessions, allReports] = await Promise.all([
    db.select().from(schema.teams),
    db.select().from(schema.sessions),
    db.select().from(schema.dailyReports),
  ]);
  const sessionsByTeam = new Map<number, (typeof allSessions[number])[]>();
  for (const s of allSessions) {
    const arr = sessionsByTeam.get(s.teamId) ?? [];
    arr.push(s);
    sessionsByTeam.set(s.teamId, arr);
  }
  const reportsByTeam = new Map<number, (typeof allReports[number])[]>();
  for (const r of allReports) {
    const arr = reportsByTeam.get(r.teamId) ?? [];
    arr.push(r);
    reportsByTeam.set(r.teamId, arr);
  }
  const result: Record<number, TeamProgress> = {};
  for (const t of teams) {
    result[t.id] = computeProgress(t.id, sessionsByTeam.get(t.id) ?? [], reportsByTeam.get(t.id) ?? []);
  }
  return result;
}

export interface MemberKpiSummary {
  memberId: number;
  name: string;
  averagePercent: number;
  perKpi: { kpiDefId: number; kpiName: string; targetValue: number; latest: number; percent: number; checkpointsDone: number }[];
}

export async function getMemberKpiSummary(memberId: number, memberName: string): Promise<MemberKpiSummary> {
  const progressRows = await db
    .select({
      progress: schema.kpiProgress,
      def: schema.kpiDefinitions,
    })
    .from(schema.kpiProgress)
    .innerJoin(schema.kpiDefinitions, eq(schema.kpiProgress.kpiDefId, schema.kpiDefinitions.id))
    .where(eq(schema.kpiProgress.memberId, memberId));

  let totalPercent = 0;
  const perKpi: MemberKpiSummary["perKpi"] = [];
  for (const r of progressRows) {
    const checkpoints: { round: number; value: number; date: string }[] = JSON.parse(r.progress.midCheckpoints);
    const latest = r.progress.finalValue ?? checkpoints.at(-1)?.value ?? r.progress.baseline;
    const percent = Math.min(100, Math.round((latest / r.def.targetValue) * 100));
    totalPercent += percent;
    perKpi.push({
      kpiDefId: r.def.id,
      kpiName: r.def.name,
      targetValue: r.def.targetValue,
      latest,
      percent,
      checkpointsDone: checkpoints.length,
    });
  }
  const averagePercent = perKpi.length === 0 ? 0 : Math.round(totalPercent / perKpi.length);
  return { memberId, name: memberName, averagePercent, perKpi };
}

export async function getTeamKpiAverage(teamId: number): Promise<{ kpiName: string; targetValue: number; teamAvgPercent: number }[]> {
  const defs = await db.select().from(schema.kpiDefinitions).where(eq(schema.kpiDefinitions.teamId, teamId));
  if (defs.length === 0) return [];
  const defIds = defs.map((d) => d.id);
  const allRows = await db
    .select()
    .from(schema.kpiProgress)
    .where(inArray(schema.kpiProgress.kpiDefId, defIds));
  const byDef = new Map<number, typeof allRows>();
  for (const r of allRows) {
    const arr = byDef.get(r.kpiDefId) ?? [];
    arr.push(r);
    byDef.set(r.kpiDefId, arr);
  }
  return defs.map((def) => {
    const rows = byDef.get(def.id) ?? [];
    if (rows.length === 0) return { kpiName: def.name, targetValue: def.targetValue, teamAvgPercent: 0 };
    let sum = 0;
    for (const r of rows) {
      const checkpoints: { round: number; value: number; date: string }[] = JSON.parse(r.midCheckpoints);
      const latest = r.finalValue ?? checkpoints.at(-1)?.value ?? r.baseline;
      sum += Math.min(100, (latest / def.targetValue) * 100);
    }
    return { kpiName: def.name, targetValue: def.targetValue, teamAvgPercent: Math.round(sum / rows.length) };
  });
}

export async function getDashboardSummary() {
  const teams = await db.select().from(schema.teams);
  const totalMembers = (await db.select({ c: sql<number>`count(*)` }).from(schema.members))[0]?.c ?? 0;
  const progresses = await getAllTeamProgress();
  const avgProgress = teams.length === 0 ? 0 : Math.round(
    Object.values(progresses).reduce((s, p) => s + p.progressPercent, 0) / teams.length,
  );
  return {
    totalTeams: teams.length,
    totalMembers,
    avgProgress,
  };
}
