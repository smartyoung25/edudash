/**
 * 공개 구글 스프레드시트에서 팀별 일일현황을 읽어 daily_reports 테이블에 저장합니다.
 * 인증 불필요 — "링크가 있는 모든 사용자 뷰어" 공유 조건에서 동작합니다.
 */

import ExcelJS from "exceljs";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";

export interface SheetSyncResult {
  ok: boolean;
  message: string;
  teams: { name: string; sessions: number; skipped: number }[];
  totalUpserted: number;
}

/** ExcelJS Cell 값을 문자열로 변환 */
function cellStr(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && "result" in (val as object)) {
    return String((val as ExcelJS.CellFormulaValue).result ?? "");
  }
  if (val instanceof Date) return val.toISOString();
  return String(val).trim();
}

/** "03월 17일" 또는 Date 객체 → "2026-MM-DD" */
function parseDate(val: ExcelJS.CellValue): string | null {
  if (!val) return null;

  // ExcelJS가 날짜를 Date 객체로 파싱한 경우
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = cellStr(val);

  // ISO 문자열인 경우
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // GMT 문자열인 경우 (ExcelJS string 셀)
  if (s.includes("GMT")) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const dy = String(d.getDate()).padStart(2, "0");
      return `${y}-${mo}-${dy}`;
    }
  }

  // "N월 M일" 패턴
  const m = s.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    const month = m[1].padStart(2, "0");
    const day = m[2].padStart(2, "0");
    return `2026-${month}-${day}`;
  }

  // "M.D" / "M.DD" / "MM.DD" 패턴 (예: "3.03", "03.11") — 앞의 점 허용 (".03.11")
  const dot = s.replace(/^\.+/, "").match(/^(\d{1,2})\.(\d{1,2})$/);
  if (dot) {
    const month = dot[1].padStart(2, "0");
    const day = dot[2].padStart(2, "0");
    return `2026-${month}-${day}`;
  }

  return null;
}

/** 시트명에서 품목 추론 */
function inferProduct(sheetName: string): "감귤" | "딸기" | "배" | "토마토" | "포도" | "한우" {
  if (sheetName.includes("딸기")) return "딸기";
  if (sheetName.includes("감귤")) return "감귤";
  if (sheetName.includes("포도")) return "포도";
  if (sheetName.includes("한우")) return "한우";
  if (sheetName.includes("토마토")) return "토마토";
  return "배";
}

/**
 * 시트명 → DB 팀 ID 매칭. 매칭 실패 시 null.
 * 자동 생성하지 않음 — 미매칭 시트는 호출부에서 skip + 경고 로그.
 * team_aliases 테이블도 조회한다.
 */
export async function matchOrCreateTeam(
  sheetName: string,
  teams: { id: number; name: string; product: string }[],
): Promise<number | null> {
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const sn = norm(sheetName);

  // 1. 정확 매칭
  for (const t of teams) {
    if (norm(t.name) === sn) return t.id;
  }

  // 2. 포함 매칭
  for (const t of teams) {
    const tn = norm(t.name);
    if (sn.includes(tn) || tn.includes(sn)) return t.id;
  }

  // 3. team_aliases 조회
  const aliases = await db
    .select({ teamId: schema.teamAliases.teamId, alias: schema.teamAliases.alias })
    .from(schema.teamAliases);
  for (const a of aliases) {
    if (norm(a.alias) === sn) return a.teamId;
  }

  // 4. 매칭 실패 — 자동 생성 금지
  return null;
}

/** 시트 1장을 파싱해 세션 데이터 배열 반환 */
export function parseSheet(ws: ExcelJS.Worksheet): {
  sessionNo: number;
  reportDate: string;
  subject: string;
  attended: number;
  absent: number;
  absentNames: string;
}[] {
  // 행 index 탐색
  let dateRow = -1, attendedRow = -1, absentRow = -1, subjectRow = -1;
  const ROW_KEYWORDS: Record<string, string[]> = {
    date: ["시행 일시", "수업일자", "시행일시", "교육일자"],
    attended: ["참여 인원", "참여인원", "출석인원", "출석"],
    absent: ["불참자", "결석자", "불참"],
    subject: ["교육주제", "수업주제", "주제"],
  };

  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const label = cellStr(ws.getRow(r).getCell(1).value).replace(/\s/g, "");
    if (ROW_KEYWORDS.date.some((k) => label.includes(k.replace(/\s/g, "")))) dateRow = r;
    if (ROW_KEYWORDS.attended.some((k) => label.includes(k.replace(/\s/g, "")))) attendedRow = r;
    if (ROW_KEYWORDS.absent.some((k) => label.includes(k.replace(/\s/g, "")))) absentRow = r;
    if (ROW_KEYWORDS.subject.some((k) => label.includes(k.replace(/\s/g, "")))) subjectRow = r;
  }

  if (dateRow === -1) return [];

  // 1행에서 차시 컬럼 위치 파악 (1차, 2차, ...)
  const headerRow = ws.getRow(1);
  const sessionCols: { col: number; no: number }[] = [];
  for (let c = 2; c <= ws.columnCount; c++) {
    const h = cellStr(headerRow.getCell(c).value);
    const m = h.match(/^(\d+)차/);
    if (m) sessionCols.push({ col: c, no: parseInt(m[1]) });
  }

  const results = [];
  for (const { col, no } of sessionCols) {
    const reportDate = parseDate(ws.getRow(dateRow).getCell(col).value);
    if (!reportDate) continue; // 날짜 없으면 아직 미시행

    const subject = cellStr(ws.getRow(subjectRow > 0 ? subjectRow : dateRow).getCell(col).value);
    const attendedStr = cellStr(ws.getRow(attendedRow > 0 ? attendedRow : dateRow).getCell(col).value);
    const attended = parseInt(attendedStr) || 0;

    let absentNames = "";
    let absent = 0;
    if (absentRow > 0) {
      const raw = cellStr(ws.getRow(absentRow).getCell(col).value);
      if (raw && raw !== "X" && raw !== "x" && raw !== "-") {
        absentNames = raw;
        absent = raw.split(/[,、\n]/).filter((s) => s.trim()).length;
      }
    }

    results.push({ sessionNo: no, reportDate, subject, attended, absent, absentNames });
  }

  return results;
}

/** 메인 동기화 함수 */
export async function syncPublicSheet(spreadsheetId: string): Promise<SheetSyncResult> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;

  // XLSX 다운로드
  const res = await fetch(url);
  if (!res.ok) throw new Error(`구글 시트 다운로드 실패: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // ExcelJS 파싱
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);

  // DB 팀 목록 조회
  const dbTeams = await db
    .select({ id: schema.teams.id, name: schema.teams.name, product: schema.teams.product })
    .from(schema.teams);

  const teamResults: SheetSyncResult["teams"] = [];
  let totalUpserted = 0;

  for (const ws of wb.worksheets) {
    const sheetName = ws.name.trim();
    const teamId = await matchOrCreateTeam(sheetName, dbTeams);
    if (teamId == null) {
      console.warn(`[시트] 매칭 실패 — 무시: "${sheetName}" (DB 팀 또는 alias 등록 필요)`);
      teamResults.push({ name: sheetName, sessions: 0, skipped: 0 });
      continue;
    }

    const sessions = parseSheet(ws);
    let upserted = 0;
    let skipped = 0;

    for (const s of sessions) {
      try {
        // 중복 확인 (teamId + sessionNo + reportDate unique)
        const existing = await db
          .select({ id: schema.dailyReports.id })
          .from(schema.dailyReports)
          .where(
            and(
              eq(schema.dailyReports.teamId, teamId),
              eq(schema.dailyReports.sessionNo, s.sessionNo),
              eq(schema.dailyReports.reportDate, s.reportDate)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // 업데이트
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
          // 삽입
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
        upserted++;
      } catch {
        skipped++;
      }
    }

    teamResults.push({ name: sheetName, sessions: upserted, skipped });
    totalUpserted += upserted;
  }

  return {
    ok: true,
    message: `${wb.worksheets.length}개 팀 시트 처리, 총 ${totalUpserted}건 반영`,
    teams: teamResults,
    totalUpserted,
  };
}
