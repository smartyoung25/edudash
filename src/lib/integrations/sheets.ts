import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { getSheetsClient } from "./google-auth";
import { env, isSheetsEnabled } from "../env";

export interface SyncResult {
  ok: boolean;
  message: string;
  inserted?: number;
  skipped?: number;
}

export async function readDailyReports(): Promise<SyncResult> {
  if (!isSheetsEnabled()) {
    return { ok: false, message: "구글 시트 자격증명 미설정 (.env.local 확인)" };
  }
  const sheets = getSheetsClient();
  if (!sheets) return { ok: false, message: "Google API 클라이언트 초기화 실패" };

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: env.DAILY_SHEETS_SPREADSHEET_ID,
      range: "A2:I",
    });
    const rows = res.data.values ?? [];
    let inserted = 0;
    let skipped = 0;
    const teams = await db.select().from(schema.teams);

    for (const r of rows) {
      const [reportDate, teamName, sessionNoStr, subject, attendedStr, absentStr, absentNames, absentReason, notes] = r;
      if (!reportDate || !teamName || !sessionNoStr) continue;
      const team = teams.find((t) => t.name === teamName);
      if (!team) { skipped++; continue; }
      const sessionNo = Number(sessionNoStr);
      const exists = await db
        .select()
        .from(schema.dailyReports)
        .where(
          and(
            eq(schema.dailyReports.teamId, team.id),
            eq(schema.dailyReports.sessionNo, sessionNo),
            eq(schema.dailyReports.reportDate, reportDate),
          ),
        )
        .limit(1);
      if (exists.length > 0) { skipped++; continue; }
      await db.insert(schema.dailyReports).values({
        teamId: team.id,
        sessionNo,
        reportDate,
        subject: subject ?? null,
        attended: Number(attendedStr ?? 0),
        absent: Number(absentStr ?? 0),
        absentNames: absentNames ?? null,
        absentReason: absentReason ?? null,
        notes: notes ?? null,
        source: "sheet",
      });
      inserted++;
    }
    return { ok: true, message: `${inserted}건 신규, ${skipped}건 스킵`, inserted, skipped };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}

export interface ExpenseRow {
  teamName: string;
  cohort: string;
  expenseDate: string;
  item: string;
  amount: number;
  notes?: string;
  driveUrl?: string;
}

export async function appendExpenseRow(row: ExpenseRow): Promise<SyncResult> {
  if (!env.EXPENSE_SHEETS_SPREADSHEET_ID) {
    return { ok: false, message: "EXPENSE_SHEETS_SPREADSHEET_ID 미설정" };
  }
  const sheets = getSheetsClient();
  if (!sheets) return { ok: false, message: "Google API 클라이언트 초기화 실패" };

  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.EXPENSE_SHEETS_SPREADSHEET_ID,
      range: "A:I",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          now, row.teamName, row.cohort, row.expenseDate, row.item, row.amount,
          row.notes ?? "", row.driveUrl ?? "", "자동추출",
        ]],
      },
    });
    return { ok: true, message: "행 추가 완료" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}

export async function updateSheetsStatus(result: SyncResult) {
  await db
    .update(schema.integrationStatus)
    .set({
      enabled: isSheetsEnabled(),
      lastRunAt: new Date().toISOString(),
      status: result.ok ? "ok" : "error",
      message: result.message,
    })
    .where(eq(schema.integrationStatus.type, "sheets"));
}
