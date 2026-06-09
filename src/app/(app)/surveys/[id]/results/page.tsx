import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { Download, Pencil, ClipboardList, Star, MessageSquare } from "lucide-react";
import { SCALE5_OPTIONS, type QType } from "@/lib/survey";
import { ensureSurveyTables } from "@/lib/survey-db";

export const dynamic = "force-dynamic";

export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
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
  const responses = await db
    .select()
    .from(schema.surveyResponses)
    .where(eq(schema.surveyResponses.surveyId, numId))
    .orderBy(asc(schema.surveyResponses.submittedAt));
  const answers = await db.select().from(schema.surveyAnswers);

  const respIds = new Set(responses.map((r) => r.id));
  // questionId → answers[]
  const byQuestion = new Map<number, { responseId: number; valueInt: number | null; valueText: string | null }[]>();
  for (const a of answers) {
    if (!respIds.has(a.responseId)) continue;
    if (!byQuestion.has(a.questionId)) byQuestion.set(a.questionId, []);
    byQuestion.get(a.questionId)!.push(a);
  }
  const respById = new Map(responses.map((r) => [r.id, r]));

  // 전체 5점 문항 평균
  const scaleQs = questions.filter((q) => q.qType === "scale5");
  let allScaleSum = 0, allScaleCnt = 0;
  const qAvg = new Map<number, { avg: number; cnt: number; dist: number[] }>();
  for (const q of scaleQs) {
    const list = (byQuestion.get(q.id) ?? []).filter((a) => a.valueInt != null && a.valueInt >= 1 && a.valueInt <= 5);
    const dist = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const a of list) { dist[a.valueInt! - 1]++; sum += a.valueInt!; allScaleSum += a.valueInt!; allScaleCnt++; }
    qAvg.set(q.id, { avg: list.length ? sum / list.length : 0, cnt: list.length, dist });
  }
  const overallAvg = allScaleCnt ? (allScaleSum / allScaleCnt) : 0;

  // 작목별 평균 (5점 문항 전체 기준)
  const byProduct = new Map<string, { sum: number; cnt: number }>();
  for (const a of answers) {
    if (!respIds.has(a.responseId) || a.valueInt == null) continue;
    const q = questions.find((x) => x.id === a.questionId);
    if (!q || q.qType !== "scale5") continue;
    const prod = respById.get(a.responseId)?.product ?? "(미선택)";
    const cur = byProduct.get(prod) ?? { sum: 0, cnt: 0 };
    cur.sum += a.valueInt; cur.cnt++;
    byProduct.set(prod, cur);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`결과 · ${survey.title}`}
        description="문항별 평균·분포와 작목별 비교, 주관식 응답을 확인합니다."
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/surveys/${survey.id}`}>
              <Button size="sm" variant="outline"><Pencil className="h-4 w-4" /> 편집</Button>
            </Link>
            <a href={`/api/surveys/${survey.id}/export`}>
              <Button size="sm"><Download className="h-4 w-4" /> 엑셀 다운로드</Button>
            </a>
          </div>
        }
      />

      <div className="px-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="총 응답 수" value={responses.length} icon={ClipboardList} accent="blue" />
          <StatCard label="전체 평균 (5점)" value={overallAvg ? overallAvg.toFixed(2) : "–"} icon={Star} accent="emerald" hint={`${scaleQs.length}개 척도 문항`} />
          <StatCard label="문항 수" value={questions.length} icon={MessageSquare} accent="violet" />
        </div>

        {responses.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            아직 응답이 없습니다. 목록에서 [링크] 버튼으로 공개 링크를 복사해 배포하세요. (설문 상태가 &apos;진행중&apos;이어야 응답 가능)
          </Card>
        )}

        {/* 작목별 평균 */}
        {byProduct.size > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">작목별 평균 (5점 문항 전체)</h3>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {[...byProduct.entries()].sort((a, b) => (b[1].sum / b[1].cnt) - (a[1].sum / a[1].cnt)).map(([prod, v]) => (
                <div key={prod} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{prod}</span>
                  <span className="font-semibold">{(v.sum / v.cnt).toFixed(2)} <span className="text-xs text-muted-foreground font-normal">({v.cnt}답)</span></span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 문항별 결과 */}
        <div className="space-y-3">
          {questions.map((q, i) => (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {q.section && <Badge variant="outline" className="text-xs">{q.section}</Badge>}
                    <span className="font-medium text-sm">{q.label}</span>
                  </div>
                </div>
                {q.qType === "scale5" && (
                  <span className="text-sm font-semibold whitespace-nowrap">평균 {qAvg.get(q.id)?.cnt ? qAvg.get(q.id)!.avg.toFixed(2) : "–"}</span>
                )}
              </div>

              {q.qType === "scale5" && (() => {
                const a = qAvg.get(q.id)!;
                const max = Math.max(1, ...a.dist);
                return (
                  <div className="space-y-1 pl-6">
                    {SCALE5_OPTIONS.map((opt) => {
                      const c = a.dist[opt.value - 1];
                      return (
                        <div key={opt.value} className="flex items-center gap-2 text-xs">
                          <span className="w-24 text-right text-muted-foreground">{opt.value} {opt.label}</span>
                          <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
                            <div className="h-full bg-emerald-400" style={{ width: `${(c / max) * 100}%` }} />
                          </div>
                          <span className="w-8 text-right tabular-nums">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {q.qType === "choice" && (() => {
                const list = byQuestion.get(q.id) ?? [];
                const opts = q.options ? (JSON.parse(q.options) as string[]) : [];
                const counts = new Map<string, number>();
                for (const a of list) { if (a.valueText) counts.set(a.valueText, (counts.get(a.valueText) ?? 0) + 1); }
                const max = Math.max(1, ...opts.map((o) => counts.get(o) ?? 0));
                return (
                  <div className="space-y-1 pl-6">
                    {opts.map((o) => {
                      const c = counts.get(o) ?? 0;
                      return (
                        <div key={o} className="flex items-center gap-2 text-xs">
                          <span className="w-32 text-right text-muted-foreground truncate">{o}</span>
                          <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
                            <div className="h-full bg-sky-400" style={{ width: `${(c / max) * 100}%` }} />
                          </div>
                          <span className="w-8 text-right tabular-nums">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {(q.qType === "short" || q.qType === "long") && (() => {
                const list = (byQuestion.get(q.id) ?? []).filter((a) => a.valueText && a.valueText.trim() !== "");
                if (list.length === 0) return <p className="pl-6 text-xs text-muted-foreground">응답 없음</p>;
                return (
                  <div className="pl-6 space-y-1.5">
                    {list.map((a, idx) => {
                      const r = respById.get(a.responseId);
                      return (
                        <div key={idx} className="rounded border bg-muted/20 px-3 py-1.5 text-sm">
                          {(r?.product || r?.teamName) && (
                            <span className="text-xs text-muted-foreground mr-2">[{r?.product ?? ""}{r?.teamName ? ` ${r.teamName}` : ""}]</span>
                          )}
                          {a.valueText}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
