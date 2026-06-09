import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { SurveyInput } from "@/lib/survey";
import { ensureSurveyTables } from "@/lib/survey-db";
import { randomUUID } from "crypto";

export async function GET() {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const surveys = await db.select().from(schema.surveys).orderBy(desc(schema.surveys.createdAt));
  const responses = await db.select({ surveyId: schema.surveyResponses.surveyId }).from(schema.surveyResponses);
  const countBySurvey = new Map<number, number>();
  for (const r of responses) countBySurvey.set(r.surveyId, (countBySurvey.get(r.surveyId) ?? 0) + 1);
  return NextResponse.json(
    surveys.map((s) => ({ ...s, responseCount: countBySurvey.get(s.id) ?? 0 })),
  );
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["admin"]);
  await ensureSurveyTables();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const parsed = SurveyInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.surveys)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      publicToken: randomUUID(),
      collectTeam: parsed.data.collectTeam ? 1 : 0,
      createdBy: session.userId ?? null,
      createdByName: session.name ?? "",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.surveys.id });
  const surveyId = inserted[0].id;

  await db.insert(schema.surveyQuestions).values(
    parsed.data.questions.map((q, i) => ({
      surveyId,
      sortOrder: i,
      section: q.section ?? null,
      qType: q.qType,
      label: q.label,
      required: q.required ? 1 : 0,
      options: q.qType === "choice" ? JSON.stringify(q.options ?? []) : null,
    })),
  );

  return NextResponse.json({ ok: true, id: surveyId });
}
