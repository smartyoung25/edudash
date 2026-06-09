import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { asc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { SurveyInput } from "@/lib/survey";
import { ensureSurveyTables } from "@/lib/survey-db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const survey = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, numId)).limit(1))[0];
  if (!survey) return NextResponse.json({ error: "not found" }, { status: 404 });

  const questions = await db
    .select()
    .from(schema.surveyQuestions)
    .where(eq(schema.surveyQuestions.surveyId, numId))
    .orderBy(asc(schema.surveyQuestions.sortOrder));

  return NextResponse.json({
    ...survey,
    questions: questions.map((q) => ({
      ...q,
      options: q.options ? (JSON.parse(q.options) as string[]) : [],
    })),
  });
}

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
  const parsed = SurveyInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  await db
    .update(schema.surveys)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      collectTeam: parsed.data.collectTeam ? 1 : 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.surveys.id, numId));

  // 응답이 이미 있으면 문항 교체는 데이터 정합성을 위해 건너뜀(메타만 수정)
  const respCount = (await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.surveyResponses)
    .where(eq(schema.surveyResponses.surveyId, numId)))[0]?.c ?? 0;

  if (respCount > 0) {
    return NextResponse.json({ ok: true, id: numId, questionsLocked: true });
  }

  // 문항 전체 교체 (단순/안전).
  await db.delete(schema.surveyQuestions).where(eq(schema.surveyQuestions.surveyId, numId));
  await db.insert(schema.surveyQuestions).values(
    parsed.data.questions.map((q, i) => ({
      surveyId: numId,
      sortOrder: i,
      section: q.section ?? null,
      qType: q.qType,
      label: q.label,
      required: q.required ? 1 : 0,
      options: q.qType === "choice" ? JSON.stringify(q.options ?? []) : null,
    })),
  );

  return NextResponse.json({ ok: true, id: numId });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const existing = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, numId)).limit(1))[0];
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.delete(schema.surveys).where(eq(schema.surveys.id, numId));
  return NextResponse.json({ ok: true });
}
