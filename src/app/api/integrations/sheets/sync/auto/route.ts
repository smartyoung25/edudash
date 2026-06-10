import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncPublicSheet } from "@/lib/integrations/gsheets-public";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

// Vercel Cron(Authorization: Bearer <CRON_SECRET>) 또는 admin 세션만 허용
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

async function runSync() {
  const spreadsheetId = process.env.DAILY_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json(
      { ok: false, message: "DAILY_SHEETS_SPREADSHEET_ID 환경변수가 설정되지 않았습니다." },
      { status: 400 },
    );
  }
  try {
    const result = await syncPublicSheet(spreadsheetId);
    await db
      .update(schema.integrationStatus)
      .set({ enabled: true, lastRunAt: new Date().toISOString(), status: "ok", message: result.message })
      .where(eq(schema.integrationStatus.type, "sheets"));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await db
      .update(schema.integrationStatus)
      .set({ lastRunAt: new Date().toISOString(), status: "error", message })
      .where(eq(schema.integrationStatus.type, "sheets"));
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

// Vercel Cron 은 GET 으로 호출됨
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runSync();
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runSync();
}
