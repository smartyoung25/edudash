import { db, schema } from "@/db/client";
import { eq, and, sql } from "drizzle-orm";

export interface TeamProgress {
  teamId: number;
  total: number;
  done: number;
  inProgress: number;
  planned: number;
  progressPercent: number;
  currentSession: number; // 진행중 차시 또는 마지막 완료 차시 + 1
}

export async function getTeamProgress(teamId: number): Promise<TeamProgress> {
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.teamId, teamId));
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const inProgress = rows.filter((r) => r.status === "in-progress").length;
  const planned = rows.filter((r) => r.status === "planned").length;
  const progressPercent = total === 0 ? 0 : Math.round((done / total) * 100);
  const inProgRow = rows.find((r) => r.status === "in-progress");
  const currentSession = inProgRow ? inProgRow.sessionNo : Math.min(done + 1, total);
  return { teamId, total, done, inProgress, planned, progressPercent, currentSession };
}

export async function getAllTeamProgress(): Promise<Record<number, TeamProgress>> {
  const teams = await db.select().from(schema.teams);
  const result: Record<number, TeamProgress> = {};
  for (const t of teams) {
    result[t.id] = await getTeamProgress(t.id);
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
  const result: { kpiName: string; targetValue: number; teamAvgPercent: number }[] = [];
  for (const def of defs) {
    const rows = await db
      .select()
      .from(schema.kpiProgress)
      .where(eq(schema.kpiProgress.kpiDefId, def.id));
    if (rows.length === 0) {
      result.push({ kpiName: def.name, targetValue: def.targetValue, teamAvgPercent: 0 });
      continue;
    }
    let sum = 0;
    for (const r of rows) {
      const checkpoints: { round: number; value: number; date: string }[] = JSON.parse(r.midCheckpoints);
      const latest = r.finalValue ?? checkpoints.at(-1)?.value ?? r.baseline;
      sum += Math.min(100, (latest / def.targetValue) * 100);
    }
    result.push({ kpiName: def.name, targetValue: def.targetValue, teamAvgPercent: Math.round(sum / rows.length) });
  }
  return result;
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
