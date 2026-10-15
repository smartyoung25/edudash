// 교육운영진행확인_이암허브_260812.xlsx (코디일지 기반 실제 회차 현황) → sessions.scheduled_date/status + daily_reports 반영
// dry-run(기본): node scripts/import-education-status-260812.mjs
// 실제 적용:     node scripts/import-education-status-260812.mjs --apply
// 로컬 대신 운영 DB: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 환경변수가 있으면 그쪽에 접속
import { createClient } from "@libsql/client";
import ExcelJS from "exceljs";
import dotenv from "dotenv";

const XLSX_PATH = "D:/2026/1. 프로젝트/1. 성장농 역량향상/5.◈운영팀/교육운영진행확인_이암허브_260812.xlsx";
const SKIP_SHEETS = new Set(["안내", "예산 양식"]);
const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");
// 오늘 이후 날짜는 "아직 진행 안 한 회차" — 엑셀 회색칸(코디일지 없어 계획일을 그대로 적어둔 값)이 완료로 잘못 표시되는 것을 방지.
// 전체 회차 수(sessions 행 자체)는 절대 건드리지 않고, 완료 표시만 오늘까지로 제한한다.
const TODAY = new Date().toISOString().slice(0, 10);
// source='sheet'로 저장하면 12시간마다 도는 구글시트 자동동기화(syncPublicSheet)가 "이번 파싱결과에 없는 sheet행"으로 보고
// 지우거나 자기 쪽(구글시트, 값이 더 부실함) 값으로 덮어써버림 — 반드시 'manual'로 저장하고 notes에 태그를 남겨
// (a) 자동동기화의 reconcile 대상에서 제외되고 (b) 이 스크립트 재실행 시에는 우리가 넣은 row인지 구분해 갱신 가능하게 한다.
const IMPORT_TAG = "[엑셀260812]";

if (PROD) dotenv.config({ path: ".env.vercel.prod" });

const c = PROD
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: "file:./data/app.db" });

function cellStr(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && "result" in val) return String(val.result ?? "");
  if (val instanceof Date) return val.toISOString();
  return String(val).trim();
}

// "0226" -> "2026-02-26" (엑셀 날짜 행은 MMDD 4자리 텍스트)
function parseMMDD(val) {
  const s = cellStr(val);
  const m = s.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10), day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `2026-${m[1]}-${m[2]}`;
}

function findRow(ws, labels) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const label = cellStr(ws.getRow(r).getCell(1).value).replace(/\s/g, "");
    if (labels.some((k) => label === k)) return r;
  }
  return -1;
}

function findHeaderRow(ws) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let hits = 0;
    for (let col = 2; col <= ws.columnCount; col++) {
      if (/^\d+차$/.test(cellStr(row.getCell(col).value))) hits++;
    }
    if (hits >= 2) return r;
  }
  return -1;
}

function parseSheet(ws) {
  const headerRow = findHeaderRow(ws);
  if (headerRow === -1) return [];
  const dateRow = findRow(ws, ["날짜"]);
  const subjectRow = findRow(ws, ["주제"]);
  const attendedRow = findRow(ws, ["참석자수"]);
  const absentRow = findRow(ws, ["불참자"]);
  if (dateRow === -1) return [];

  const header = ws.getRow(headerRow);
  const cols = [];
  for (let col = 2; col <= ws.columnCount; col++) {
    const m = cellStr(header.getCell(col).value).match(/^(\d+)차$/);
    if (m) cols.push({ col, no: parseInt(m[1], 10) });
  }

  const out = [];
  for (const { col, no } of cols) {
    const reportDate = parseMMDD(ws.getRow(dateRow).getCell(col).value);
    if (!reportDate) continue; // 실제 교육일 미확인 회차는 건드리지 않음
    const subject = subjectRow > 0 ? cellStr(ws.getRow(subjectRow).getCell(col).value) : "";
    const attendedRaw = attendedRow > 0 ? cellStr(ws.getRow(attendedRow).getCell(col).value) : "";
    const attended = parseInt(attendedRaw, 10) || 0;

    let absentNames = "", absent = 0;
    if (absentRow > 0) {
      const raw = cellStr(ws.getRow(absentRow).getCell(col).value);
      if (raw && raw !== "전원참석" && raw !== "X" && raw !== "x" && raw !== "-") {
        absentNames = raw;
        absent = raw.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean).length;
      }
    }
    out.push({ sessionNo: no, reportDate, subject, attended, absent, absentNames });
  }
  return out;
}

function norm(s) { return String(s).replace(/\s/g, "").toLowerCase(); }

function matchTeam(sheetName, teams, aliases) {
  const sn = norm(sheetName);
  for (const t of teams) if (norm(t.name) === sn) return t.id;
  for (const a of aliases) if (norm(a.alias) === sn) return a.team_id;
  for (const t of teams) {
    const tn = norm(t.name);
    if (sn.includes(tn) || tn.includes(sn)) return t.id;
  }
  const sortedAliases = [...aliases].sort((a, b) => b.alias.length - a.alias.length);
  for (const a of sortedAliases) {
    const an = norm(a.alias);
    if (an.length >= 3 && (sn.includes(an) || an.includes(sn))) return a.team_id;
  }
  return null;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX_PATH);

const teamsRes = await c.execute("SELECT id, name FROM teams");
const aliasRes = await c.execute("SELECT team_id, alias FROM team_aliases");
const teams = teamsRes.rows;
const aliases = aliasRes.rows;

let totals = { sessionUpdate: 0, sessionRevert: 0, drUpdate: 0, drInsert: 0, drDelete: 0, drSkipManual: 0 };
const perTeam = [];
const sampleDiffs = [];

for (const ws of wb.worksheets) {
  const sheetName = ws.name.trim();
  if (SKIP_SHEETS.has(sheetName)) continue;
  const teamId = matchTeam(sheetName, teams, aliases);
  if (!teamId) { console.log(`✗ 매칭실패: ${sheetName}`); continue; }

  const rows = parseSheet(ws);
  if (rows.length === 0) { console.log(`⚠ 파싱실패(0행): ${sheetName}`); continue; }

  const sessionsRes = await c.execute({ sql: "SELECT session_no, scheduled_date, status FROM sessions WHERE team_id=?", args: [teamId] });
  const sessionsByNo = new Map(sessionsRes.rows.map((r) => [r.session_no, r]));

  const drRes = await c.execute({ sql: "SELECT id, session_no, report_date, attended, absent, source, notes FROM daily_reports WHERE team_id=?", args: [teamId] });
  const drBySession = new Map();
  for (const r of drRes.rows) {
    if (!drBySession.has(r.session_no)) drBySession.set(r.session_no, []);
    drBySession.get(r.session_no).push(r);
  }

  let t = { sheet: sheetName, teamId, sessionUpdate: 0, sessionRevert: 0, drUpdate: 0, drInsert: 0, drDelete: 0, drSkipManual: 0 };

  for (const s of rows) {
    const sess = sessionsByNo.get(s.sessionNo);
    const existing = drBySession.get(s.sessionNo) || [];
    const isOurs = (r) => r.source !== "manual" || (r.notes || "").startsWith(IMPORT_TAG);
    const manual = existing.filter((r) => !isOurs(r)); // 진짜 사용자 수기입력 — 절대 건드리지 않음
    const ours = existing.filter(isOurs); // 우리가 이전에 넣은 row(구버전 'sheet' 태그 포함) — 자유롭게 갱신/정리

    if (s.reportDate > TODAY) {
      // 아직 도래하지 않은 날짜 — 완료 처리하지 않는다. 전체 회차(sessions row)는 유지, 상태만 원복.
      if (sess && sess.status === "done") {
        if (sampleDiffs.length < 15) {
          sampleDiffs.push(`[${sheetName}] session#${s.sessionNo} 미래날짜(${s.reportDate}) → status done->planned 원복`);
        }
        if (APPLY) {
          await c.execute({ sql: "UPDATE sessions SET status='planned' WHERE team_id=? AND session_no=?", args: [teamId, s.sessionNo] });
        }
        t.sessionRevert++;
      }
      if (ours.length > 0) {
        if (sampleDiffs.length < 15) {
          sampleDiffs.push(`[${sheetName}] daily_report#${s.sessionNo} 미래날짜(${s.reportDate}) → 삭제`);
        }
        if (APPLY) {
          for (const dup of ours) await c.execute({ sql: "DELETE FROM daily_reports WHERE id=?", args: [dup.id] });
        }
        t.drDelete += ours.length;
      }
      continue;
    }

    // sessions.scheduled_date / status — 오늘까지 실제 진행된 회차만 완료 처리
    if (sess) {
      if (sess.scheduled_date !== s.reportDate || sess.status !== "done") {
        if (sampleDiffs.length < 15) {
          sampleDiffs.push(`[${sheetName}] session#${s.sessionNo} scheduled_date ${sess.scheduled_date}->${s.reportDate}, status ${sess.status}->done`);
        }
        if (APPLY) {
          await c.execute({ sql: "UPDATE sessions SET scheduled_date=?, status='done' WHERE team_id=? AND session_no=?", args: [s.reportDate, teamId, s.sessionNo] });
        }
        t.sessionUpdate++;
      }
    }

    // daily_reports
    if (manual.length > 0) {
      t.drSkipManual++;
      continue;
    }

    if (ours.length === 1) {
      const cur = ours[0];
      const changed = cur.report_date !== s.reportDate || cur.attended !== s.attended || cur.absent !== s.absent || cur.source !== "manual";
      if (changed) {
        if (sampleDiffs.length < 15) {
          sampleDiffs.push(`[${sheetName}] daily_report#${s.sessionNo} date ${cur.report_date}->${s.reportDate}, attended ${cur.attended}->${s.attended}, absent ${cur.absent}->${s.absent}`);
        }
        if (APPLY) {
          await c.execute({
            sql: "UPDATE daily_reports SET report_date=?, subject=COALESCE(?, subject), attended=?, absent=?, absent_names=?, source='manual', notes=? WHERE id=?",
            args: [s.reportDate, s.subject || null, s.attended, s.absent, s.absentNames || null, IMPORT_TAG, cur.id],
          });
        }
        t.drUpdate++;
      }
    } else {
      if (ours.length > 1 && APPLY) {
        for (const dup of ours) await c.execute({ sql: "DELETE FROM daily_reports WHERE id=?", args: [dup.id] });
      }
      if (sampleDiffs.length < 15) {
        sampleDiffs.push(`[${sheetName}] daily_report#${s.sessionNo} NEW date=${s.reportDate} attended=${s.attended} absent=${s.absent}`);
      }
      if (APPLY) {
        await c.execute({
          sql: "INSERT INTO daily_reports (team_id, session_no, report_date, subject, attended, absent, absent_names, source, notes) VALUES (?,?,?,?,?,?,?, 'manual', ?)",
          args: [teamId, s.sessionNo, s.reportDate, s.subject || null, s.attended, s.absent, s.absentNames || null, IMPORT_TAG],
        });
      }
      t.drInsert++;
    }
  }

  perTeam.push(t);
  totals.sessionUpdate += t.sessionUpdate;
  totals.sessionRevert += t.sessionRevert;
  totals.drUpdate += t.drUpdate;
  totals.drInsert += t.drInsert;
  totals.drDelete += t.drDelete;
  totals.drSkipManual += t.drSkipManual;
}

console.log(`\n오늘 기준일: ${TODAY}`);
console.log(`=== ${APPLY ? "적용 완료" : "DRY RUN (실제 반영: --apply)"} ===`);
for (const t of perTeam) {
  console.log(`  team_id=${t.teamId} (${t.sheet}): session완료처리 ${t.sessionUpdate}, session미래원복 ${t.sessionRevert}, daily갱신 ${t.drUpdate}, daily신규 ${t.drInsert}, daily미래삭제 ${t.drDelete}, manual보호스킵 ${t.drSkipManual}`);
}
console.log(`\n총 session완료처리 ${totals.sessionUpdate} / session미래원복 ${totals.sessionRevert} / daily갱신 ${totals.drUpdate} / daily신규 ${totals.drInsert} / daily미래삭제 ${totals.drDelete} / manual보호스킵 ${totals.drSkipManual}`);
console.log("\n=== 샘플 diff (최대 15개) ===");
for (const d of sampleDiffs) console.log("  " + d);
