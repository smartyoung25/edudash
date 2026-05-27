/**
 * Drive 전체 팀 운영 현황 xlsx 동기화
 * 매일 17:00 — 최신 파일을 data/drive-team-status.xlsx 로 덮어쓰기.
 * 주간보고 생성 시 이 파일을 참조한다.
 * 추가: 다운로드 후 시트의 차시 데이터를 daily_reports 테이블에 upsert.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { downloadDriveFile } from "./drive";
import { parseSheet, matchOrCreateTeam } from "./gsheets-public";
import { db, schema } from "@/db/client";

const DEFAULT_FILE_ID = "1ad9_7mr_pWVoXk3dBIR0Ht6_PDC9QVT8"; // 전체_팀_운영_현황_260508_3.xlsx
const OUT_PATH = "data/drive-team-status.xlsx";

export interface SyncResult {
  ok: boolean;
  message: string;
  bytes?: number;
  fileName?: string;
  reportsUpserted?: number;
}

export async function syncDriveTeamStatus(): Promise<SyncResult> {
  const fileId = process.env.DRIVE_TEAM_STATUS_FILE_ID || DEFAULT_FILE_ID;
  const r = await downloadDriveFile(fileId);
  if (!r.ok) return { ok: false, message: r.message };

  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_PATH, r.buf);

  // daily_reports로도 반영 — 시트당 차시 데이터 upsert
  let reportsUpserted = 0;
  try {
    reportsUpserted = await importDriveStatusToReports(r.buf);
  } catch (e) {
    console.error("[drive-team-status] daily_reports import 실패:", e);
  }

  return {
    ok: true,
    message: `${r.name} 저장 (${r.buf.length.toLocaleString()} bytes), daily_reports ${reportsUpserted}건 반영`,
    bytes: r.buf.length,
    fileName: r.name,
    reportsUpserted,
  };
}

/** xlsx 버퍼에서 daily_reports로 upsert. 별도 호출 가능. */
export async function importDriveStatusToReports(buf: Buffer): Promise<number> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any);

  const dbTeams = await db
    .select({ id: schema.teams.id, name: schema.teams.name, product: schema.teams.product })
    .from(schema.teams);

  let total = 0;
  for (const ws of wb.worksheets) {
    const sheetName = ws.name.trim();
    let teamId: number | null = null;
    try {
      teamId = await matchOrCreateTeam(sheetName, dbTeams);
    } catch {
      continue;
    }
    if (teamId == null) {
      console.warn(`[drive-team-status] 매칭 실패 — 무시: "${sheetName}"`);
      continue;
    }
    const rows = parseSheet(ws);
    for (const s of rows) {
      try {
        const existing = await db
          .select({ id: schema.dailyReports.id })
          .from(schema.dailyReports)
          .where(
            and(
              eq(schema.dailyReports.teamId, teamId),
              eq(schema.dailyReports.sessionNo, s.sessionNo),
              eq(schema.dailyReports.reportDate, s.reportDate),
            ),
          )
          .limit(1);
        if (existing.length > 0) {
          await db
            .update(schema.dailyReports)
            .set({
              subject: s.subject || undefined,
              attended: s.attended,
              absent: s.absent,
              absentNames: s.absentNames || undefined,
              source: "sheet",
            })
            .where(eq(schema.dailyReports.id, existing[0].id));
        } else {
          await db.insert(schema.dailyReports).values({
            teamId,
            sessionNo: s.sessionNo,
            reportDate: s.reportDate,
            subject: s.subject || null,
            attended: s.attended,
            absent: s.absent,
            absentNames: s.absentNames || null,
            source: "sheet",
          });
        }
        total++;
      } catch {
        // ignore row error
      }
    }
  }
  return total;
}
