import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureSurveyTables } from "@/lib/survey-db";

// 공개 엔드포인트 — 인증 없음. 토큰으로 진행중(open) 설문에만 응답 허용.

const SubmitSchema = z.object({
  product: z.string().max(50).nullish(),
  teamName: z.string().max(100).nullish(),
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        valueInt: z.number().int().nullish(),
        valueText: z.string().max(5000).nullish(),
      }),
    )
    .max(200),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureSurveyTables();

  const survey =(await db.select().from(schema.surveys).where(eq(schema.surveys.publicToken, token)).limit(1))[0];
  if (!survey) return NextResponse.json({ error: "설문을 찾을 수 없습니다." }, { status: 404 });
  if (survey.status !== "open") return NextResponse.json({ error: "마감된 설문입니다." }, { status: 403 });

  // 1인 1회: 같은 기기(쿠키)에서 이미 응답했으면 차단
  const doneCookie = `srv_done_${survey.id}`;
  if (req.cookies.get(doneCookie)?.value === "1") {
    return NextResponse.json({ error: "이미 응답하셨습니다. 한 번만 응답할 수 있습니다." }, { status: 409 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const questions = await db
    .select()
    .from(schema.surveyQuestions)
    .where(eq(schema.surveyQuestions.surveyId, survey.id))
    .orderBy(asc(schema.surveyQuestions.sortOrder));
  const qById = new Map(questions.map((q) => [q.id, q]));

  // 제출된 답안을 문항별로 정리 + 필수/범위 검증
  const ansByQ = new Map<number, { valueInt?: number | null; valueText?: string | null }>();
  for (const a of parsed.data.answers) {
    if (!qById.has(a.questionId)) continue; // 다른 설문 문항 무시
    ansByQ.set(a.questionId, { valueInt: a.valueInt ?? null, valueText: a.valueText ?? null });
  }

  for (const q of questions) {
    const a = ansByQ.get(q.id);
    const hasValue = a && ((a.valueInt !== null && a.valueInt !== undefined) || (a.valueText && a.valueText.trim() !== ""));
    if (q.required && !hasValue) {
      return NextResponse.json({ error: `필수 문항에 응답하세요: ${q.label}` }, { status: 400 });
    }
    if (a && q.qType === "scale5" && a.valueInt != null && (a.valueInt < 1 || a.valueInt > 5)) {
      return NextResponse.json({ error: "척도 값이 올바르지 않습니다." }, { status: 400 });
    }
  }

  if (survey.collectTeam && parsed.data.product && !["감귤", "딸기", "배", "토마토", "포도", "한우", "기타"].includes(parsed.data.product)) {
    return NextResponse.json({ error: "작목 값이 올바르지 않습니다." }, { status: 400 });
  }

  const inserted = await db
    .insert(schema.surveyResponses)
    .values({
      surveyId: survey.id,
      product: survey.collectTeam ? (parsed.data.product ?? null) : null,
      teamName: survey.collectTeam ? (parsed.data.teamName ?? null) : null,
      submittedAt: new Date().toISOString(),
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    })
    .returning({ id: schema.surveyResponses.id });
  const responseId = inserted[0].id;

  const rows = [];
  for (const q of questions) {
    const a = ansByQ.get(q.id);
    if (!a) continue;
    const isScaleOrChoice = q.qType === "scale5";
    rows.push({
      responseId,
      questionId: q.id,
      valueInt: isScaleOrChoice ? (a.valueInt ?? null) : null,
      valueText: q.qType === "scale5" ? null : (a.valueText ?? null),
    });
  }
  if (rows.length > 0) await db.insert(schema.surveyAnswers).values(rows);

  const res = NextResponse.json({ ok: true });
  // 1인 1회 표시 쿠키 (1년) — path "/" 로 두어 공개 응답 페이지에서도 읽힘
  res.cookies.set(doneCookie, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
