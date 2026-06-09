import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, BarChart3, QrCode } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SURVEY_STATUS_LABEL } from "@/lib/survey";
import { ensureSurveyTables } from "@/lib/survey-db";
import { CopyLinkButton, DeleteSurveyButton } from "./survey-actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  open: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closed: "bg-amber-100 text-amber-800 border-amber-200",
};

export default async function SurveysPage() {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const surveys = await db.select().from(schema.surveys).orderBy(desc(schema.surveys.createdAt));
  const responses = await db.select({ surveyId: schema.surveyResponses.surveyId }).from(schema.surveyResponses);
  const countBySurvey = new Map<number, number>();
  for (const r of responses) countBySurvey.set(r.surveyId, (countBySurvey.get(r.surveyId) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="설문조사"
        description="설문을 만들고 공개 링크로 응답을 받아 결과를 집계합니다."
        actions={
          <Link href="/surveys/new">
            <Button size="sm"><Plus className="h-4 w-4" /> 새 설문</Button>
          </Link>
        }
      />

      <div className="px-6">
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 w-24">상태</th>
                <th className="p-3">제목</th>
                <th className="p-3 w-24 text-center">응답수</th>
                <th className="p-3 w-32">작성일</th>
                <th className="p-3 w-[320px] text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {surveys.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">등록된 설문이 없습니다. 우측 상단 [새 설문]으로 추가하세요.</td></tr>
              )}
              {surveys.map((s) => (
                <tr key={s.id} className="border-t hover:bg-accent/30">
                  <td className="p-3">
                    <Badge variant="outline" className={STATUS_COLOR[s.status] ?? ""}>{SURVEY_STATUS_LABEL[s.status]}</Badge>
                  </td>
                  <td className="p-3">
                    <Link href={`/surveys/${s.id}/results`} className="font-medium hover:underline">{s.title}</Link>
                  </td>
                  <td className="p-3 text-center text-muted-foreground">{countBySurvey.get(s.id) ?? 0}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(s.createdAt)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <CopyLinkButton token={s.publicToken} />
                      <Link href={`/surveys/${s.id}/qr`}>
                        <Button type="button" size="sm" variant="outline" title="QR 코드"><QrCode className="h-4 w-4" /></Button>
                      </Link>
                      <Link href={`/surveys/${s.id}/results`}>
                        <Button type="button" size="sm" variant="outline" title="결과"><BarChart3 className="h-4 w-4" /> 결과</Button>
                      </Link>
                      <Link href={`/surveys/${s.id}`}>
                        <Button type="button" size="sm" variant="ghost" title="편집"><Pencil className="h-4 w-4" /></Button>
                      </Link>
                      <DeleteSurveyButton id={s.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
