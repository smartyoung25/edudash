import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";

const CATEGORIES = ["주임강사수당", "퍼실리테이터수당", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] as const;

export async function POST(req: Request) {
  const session = await requireAuth();
  const { teamId, category, amount } = await req.json();
  if (!teamId || !category) return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: "잘못된 카테고리" }, { status: 400 });
  if (isTeamScoped(session.role!) && session.teamId !== Number(teamId)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const amt = Math.max(0, Number(amount) || 0);

  const existing = await db.select().from(schema.expenseBudgets)
    .where(and(eq(schema.expenseBudgets.teamId, Number(teamId)), eq(schema.expenseBudgets.category, category)))
    .limit(1);

  if (existing[0]) {
    await db.update(schema.expenseBudgets).set({ amount: amt }).where(eq(schema.expenseBudgets.id, existing[0].id));
  } else {
    await db.insert(schema.expenseBudgets).values({ teamId: Number(teamId), category, amount: amt });
  }
  return NextResponse.json({ ok: true });
}
