import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ensureSurveyTables } from "@/lib/survey-db";

// 상태만 빠르게 전환(목록의 1클릭 공개/마감용). 문항·메타는 건드리지 않음.
const Body = z.object({ status: z.enum(["draft", "open", "closed"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const existing = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, numId)).limit(1))[0];
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "잘못된 상태값" }, { status: 400 });

  await db
    .update(schema.surveys)
    .set({ status: parsed.data.status, updatedAt: new Date().toISOString() })
    .where(eq(schema.surveys.id, numId));

  return NextResponse.json({ ok: true, status: parsed.data.status });
}
