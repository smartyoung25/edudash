import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncPublicSheet } from "@/lib/integrations/gsheets-public";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export async function POST() {
  await requireRole(["admin", "coordinator"]);

  const spreadsheetId = process.env.DAILY_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json(
      { ok: false, message: "DAILY_SHEETS_SPREADSHEET_ID 환경변수가 설정되지 않았습니다." },
      { status: 400 }
    );
  }

  try {
    const result = await syncPublicSheet(spreadsheetId);

    await db
      .update(schema.integrationStatus)
      .set({
        enabled: true,
        lastRunAt: new Date().toISOString(),
        status: "ok",
        message: result.message,
      })
      .where(eq(schema.integrationStatus.type, "sheets"));

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";

    await db
      .update(schema.integrationStatus)
      .set({
        lastRunAt: new Date().toISOString(),
        status: "error",
        message,
      })
      .where(eq(schema.integrationStatus.type, "sheets"));

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function GET() {
  const rows = await db
    .select()
    .from(schema.integrationStatus)
    .where(eq(schema.integrationStatus.type, "sheets"))
    .limit(1);
  return NextResponse.json(rows[0] ?? null);
}
