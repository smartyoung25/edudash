/**
 * 주간보고 자동 생성 (Vercel cron + 수동 백필 겸용)
 *
 * 실행 흐름:
 * 1. weekStart 결정 (?weekStart=YYYY-MM-DD 쿼리 우선, 없으면 이번 주 월요일)
 * 2. generateWeeklyReport(weekStart) → xlsx 버퍼 (순수 TS, ExcelJS)
 * 3. Drive 업로드 → webViewLink 획득
 * 4. report_history 에 행 삽입 (filePath = webViewLink)
 *
 * 인증: Vercel Cron(Authorization: Bearer CRON_SECRET) 또는 admin 세션
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { generateWeeklyReport } from "@/lib/reports";
import { uploadDocumentToDrive } from "@/lib/integrations/drive";
import { writeAuditLog, getClientIp } from "@/lib/audit";

function getMonday(d = new Date()): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const m = new Date(d);
  m.setDate(diff);
  return m.toISOString().slice(0, 10);
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  try {
    await requireRole(["admin"]);
    return true;
  } catch {
    return false;
  }
}

async function run(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }
  const ip = getClientIp(req);

  // weekStart: ?weekStart=YYYY-MM-DD 우선, 없으면 이번 주 월요일
  const url = new URL(req.url);
  const param = url.searchParams.get("weekStart");
  const weekStart = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : getMonday();

  // 중복 방지: 같은 weekStart 이력 있으면 스킵 옵션
  const force = url.searchParams.get("force") === "1";
  const existing = await db
    .select()
    .from(schema.reportHistory)
    .where(eq(schema.reportHistory.weekStart, weekStart))
    .limit(1);
  if (existing.length > 0 && !force) {
    return NextResponse.json({
      ok: true,
      message: `이미 생성됨 (id=${existing[0].id}) — 강제 재생성: ?force=1`,
      weekStart,
      skipped: true,
      filePath: existing[0].filePath,
    });
  }

  try {
    const buf = await generateWeeklyReport(weekStart);
    const fileName = `주간보고_${weekStart}.xlsx`;
    const month = new Date(weekStart).getMonth() + 1;

    const up = await uploadDocumentToDrive({
      teamName: "주간보고",
      docType: "주간보고",
      month,
      bytes: Buffer.from(buf),
      fileName,
    });

    if (!up.ok) {
      return NextResponse.json(
        { ok: false, message: `Drive 업로드 실패: ${up.message}`, weekStart },
        { status: 500 },
      );
    }

    const inserted = await db
      .insert(schema.reportHistory)
      .values({
        weekStart,
        filePath: up.webViewLink ?? fileName,
        generatedBy: null,
      })
      .returning({ id: schema.reportHistory.id });

    await writeAuditLog({
      action: "REPORT_GENERATE",
      detail: { weekStart, fileName, webViewLink: up.webViewLink, auto: true },
      ipAddress: ip,
    });

    return NextResponse.json({
      ok: true,
      message: "주간보고 생성 완료",
      weekStart,
      id: inserted[0]?.id,
      webViewLink: up.webViewLink,
      fileName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[REPORT_AUTO]", err);
    return NextResponse.json({ ok: false, message, weekStart }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
