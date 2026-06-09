import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { asc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { SurveyComposer, type SurveyInitial } from "../survey-composer";
import { ensureSurveyTables } from "@/lib/survey-db";
import type { QType } from "@/lib/survey";

export const dynamic = "force-dynamic";

export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const survey = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, numId)).limit(1))[0];
  if (!survey) notFound();

  const questions = await db
    .select()
    .from(schema.surveyQuestions)
    .where(eq(schema.surveyQuestions.surveyId, numId))
    .orderBy(asc(schema.surveyQuestions.sortOrder));

  const respCount = (await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.surveyResponses)
    .where(eq(schema.surveyResponses.surveyId, numId)))[0]?.c ?? 0;

  const initial: SurveyInitial = {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    collectTeam: survey.collectTeam,
    questions: questions.map((q) => ({
      section: q.section,
      qType: q.qType as QType,
      label: q.label,
      required: q.required,
      options: q.options ? (JSON.parse(q.options) as string[]) : [],
    })),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="설문 편집"
        description="제목·안내문·상태·문항을 수정합니다."
        actions={
          <Link href={`/surveys/${survey.id}/results`}>
            <Button size="sm" variant="outline"><BarChart3 className="h-4 w-4" /> 결과 보기</Button>
          </Link>
        }
      />
      <div className="px-6">
        <SurveyComposer initial={initial} questionsLocked={respCount > 0} />
      </div>
    </div>
  );
}
