import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { ensureSurveyTables } from "@/lib/survey-db";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

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
  const responses = await db
    .select()
    .from(schema.surveyResponses)
    .where(eq(schema.surveyResponses.surveyId, numId))
    .orderBy(asc(schema.surveyResponses.submittedAt));
  const answers = await db.select().from(schema.surveyAnswers);

  // responseId → (questionId → 값)
  const respIds = new Set(responses.map((r) => r.id));
  const ansMap = new Map<number, Map<number, { valueInt: number | null; valueText: string | null }>>();
  for (const a of answers) {
    if (!respIds.has(a.responseId)) continue;
    if (!ansMap.has(a.responseId)) ansMap.set(a.responseId, new Map());
    ansMap.get(a.responseId)!.set(a.questionId, { valueInt: a.valueInt, valueText: a.valueText });
  }

  const wb = new ExcelJS.Workbook();

  // 시트1: 원본 (응답별 한 행)
  const s1 = wb.addWorksheet("원본");
  const header = ["응답번호", "제출시각", "작목", "팀", ...questions.map((q, i) => `${i + 1}. ${q.label}`)];
  s1.addRow(header);
  s1.getRow(1).font = { bold: true };
  responses.forEach((r, idx) => {
    const am = ansMap.get(r.id);
    const row: (string | number)[] = [idx + 1, r.submittedAt, r.product ?? "", r.teamName ?? ""];
    for (const q of questions) {
      const a = am?.get(q.id);
      if (!a) { row.push(""); continue; }
      row.push(q.qType === "scale5" ? (a.valueInt ?? "") : (a.valueText ?? ""));
    }
    s1.addRow(row);
  });
  s1.columns.forEach((c) => { c.width = 18; });

  // 시트2: 집계 (5점 문항 평균·분포)
  const s2 = wb.addWorksheet("집계");
  s2.addRow(["문항", "유형", "응답수", "평균", "5점", "4점", "3점", "2점", "1점"]);
  s2.getRow(1).font = { bold: true };
  for (const q of questions) {
    if (q.qType === "scale5") {
      const vals: number[] = [];
      const dist = [0, 0, 0, 0, 0]; // index0=1점 ... index4=5점
      for (const r of responses) {
        const v = ansMap.get(r.id)?.get(q.id)?.valueInt;
        if (v != null && v >= 1 && v <= 5) { vals.push(v); dist[v - 1]++; }
      }
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      s2.addRow([q.label, "5점척도", vals.length, vals.length ? Number(avg.toFixed(2)) : "", dist[4], dist[3], dist[2], dist[1], dist[0]]);
    } else {
      const cnt = responses.filter((r) => {
        const a = ansMap.get(r.id)?.get(q.id);
        return a && a.valueText && a.valueText.trim() !== "";
      }).length;
      s2.addRow([q.label, q.qType === "choice" ? "객관식" : "주관식", cnt, "", "", "", "", "", ""]);
    }
  }
  s2.columns.forEach((c) => { c.width = 14; });
  s2.getColumn(1).width = 40;

  const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const fileName = `설문결과_${survey.title}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
