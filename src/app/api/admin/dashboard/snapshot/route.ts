// 주간 진행률 스냅샷 수동 트리거 — cron이 동작하기 전 1회 실행하거나 즉시 갱신용.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { snapshotProgressForThisWeek } from "@/lib/dashboard-metrics";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  await requireRole(["admin"]);
  const r = await snapshotProgressForThisWeek();
  return NextResponse.json({ ok: true, ...r });
}
