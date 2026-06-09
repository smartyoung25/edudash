import { db, schema } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { ResponseForm, type PublicQuestion } from "./response-form";
import { ensureSurveyTables } from "@/lib/survey-db";
import type { QType } from "@/lib/survey";

export const dynamic = "force-dynamic";

// 공개 페이지 — (app) 그룹 밖이라 로그인 불필요.
export default async function SurveyRespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureSurveyTables();

  const survey = (await db.select().from(schema.surveys).where(eq(schema.surveys.publicToken, token)).limit(1))[0];

  if (!survey || survey.status !== "open") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">설문을 진행할 수 없습니다</h1>
          <p className="text-sm text-muted-foreground">
            {survey ? "이 설문은 현재 마감되었습니다. 운영팀에 문의하세요." : "유효하지 않은 링크입니다."}
          </p>
        </div>
      </div>
    );
  }

  // 1인 1회: 이미 응답한 기기면 안내 화면 표시
  const alreadyDone = (await cookies()).get(`srv_done_${survey.id}`)?.value === "1";
  if (alreadyDone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">이미 응답하셨습니다</h1>
          <p className="text-sm text-muted-foreground">이 설문은 한 번만 응답할 수 있습니다. 참여해 주셔서 감사합니다.</p>
        </div>
      </div>
    );
  }

  const questions = await db
    .select()
    .from(schema.surveyQuestions)
    .where(eq(schema.surveyQuestions.surveyId, survey.id))
    .orderBy(asc(schema.surveyQuestions.sortOrder));

  // 작목별 팀 목록 (반익명 선택용)
  const teams = await db.select({ name: schema.teams.name, product: schema.teams.product }).from(schema.teams);
  const teamsByProduct: Record<string, string[]> = {};
  for (const t of teams) {
    (teamsByProduct[t.product] ??= []).push(t.name);
  }

  const publicQuestions: PublicQuestion[] = questions.map((q) => ({
    id: q.id,
    section: q.section,
    qType: q.qType as QType,
    label: q.label,
    required: q.required === 1,
    options: q.options ? (JSON.parse(q.options) as string[]) : [],
  }));

  return (
    <div className="min-h-screen bg-muted/20 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-bold">{survey.title}</h1>
          {survey.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{survey.description}</p>
          )}
        </div>
        <ResponseForm
          token={token}
          collectTeam={survey.collectTeam === 1}
          questions={publicQuestions}
          teamsByProduct={teamsByProduct}
        />
      </div>
    </div>
  );
}
