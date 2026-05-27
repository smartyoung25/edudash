/**
 * 추세 차트용 시계열 집계 — 주간 진행률 스냅샷에서 읽음.
 */

import { db, schema } from "@/db/client";
import { and, gte, inArray } from "drizzle-orm";
import { mondayOf } from "./dashboard-metrics";

export interface WeeklyTrendPoint {
  weekStart: string;       // YYYY-MM-DD (월요일)
  avgProgress: number;     // 0~100
  teamCount: number;
}

/** 최근 N주의 평균 진행률 추이. teamIds 필터 시 그 팀들만. */
export async function getProgressTrendByWeek(weeks = 8, teamIds?: number[]): Promise<WeeklyTrendPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const startMonday = mondayOf(start);

  let rows = await db.select().from(schema.progressSnapshots)
    .where(gte(schema.progressSnapshots.weekStart, startMonday));
  if (teamIds && teamIds.length > 0) {
    const set = new Set(teamIds);
    rows = rows.filter((r) => set.has(r.teamId));
  }

  const byWeek = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const cur = byWeek.get(r.weekStart) ?? { sum: 0, n: 0 };
    cur.sum += r.progressPercent;
    cur.n += 1;
    byWeek.set(r.weekStart, cur);
  }

  // weeks 길이만큼 빈 주차도 0으로 채워 시간축이 연속되게
  const points: WeeklyTrendPoint[] = [];
  const cursor = new Date(startMonday);
  for (let i = 0; i < weeks; i++) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = byWeek.get(key);
    points.push({ weekStart: key, avgProgress: bucket ? Math.round(bucket.sum / bucket.n) : 0, teamCount: bucket?.n ?? 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  return points;
}

export interface ProductBar {
  product: string;
  avgProgress: number;
  teamCount: number;
}

import { getAllTeamProgress } from "./kpi";

/** 품목별(감귤/딸기/배/토마토/포도/한우) 평균 진행률 막대. */
export async function getProgressByProduct(teamIds?: number[]): Promise<ProductBar[]> {
  const teams = await db.select().from(schema.teams);
  const filtered = teamIds ? teams.filter((t) => teamIds.includes(t.id)) : teams;
  const progresses = await getAllTeamProgress();

  const byProduct = new Map<string, { sum: number; n: number }>();
  for (const t of filtered) {
    const p = progresses[t.id];
    if (!p) continue;
    const cur = byProduct.get(t.product) ?? { sum: 0, n: 0 };
    cur.sum += p.progressPercent;
    cur.n += 1;
    byProduct.set(t.product, cur);
  }
  return Array.from(byProduct.entries()).map(([product, b]) => ({
    product, avgProgress: Math.round(b.sum / b.n), teamCount: b.n,
  })).sort((a, b) => b.avgProgress - a.avgProgress);
}
