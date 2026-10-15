// 2026년 맞춤형과정 주간보고_이암허브_260814.xlsx의 "(교육생별) 운영현황" 시트
// → 팀별 실제 교육일(농업교육포털 출석일) 을 sessions.scheduled_date/status + daily_reports에 반영.
// 이 엑셀이 sessions 계획일보다 더 정확한 "정답 소스"([[project-weekly-report-schedule]]).
//
// 회차 순서보존 매칭(오름차순 포인터): session #1,2,3... ↔ 실제일자 오름차순 1,2,3...
//   - 기존 계획일과 차이 ≤3일: 자동 보정 + 완료(done) 처리
//   - 차이 ≥5일(큰 이동): 자동 적용 안 하고 REVIEW로만 보고 (--apply-review 로 별도 적용)
//   - 회차수 > 실제일자수: 아직 안 온 회차, 손대지 않음
//   - 회차수 < 실제일자수: 초과분 REVIEW로 보고(회차 자체가 부족한 것일 수 있음)
//
// dry-run(기본): node scripts/apply-weekly-report-260814.mjs
// 실제 적용(작은 보정만): node scripts/apply-weekly-report-260814.mjs --apply
// 큰 이동(REVIEW)도 적용: node scripts/apply-weekly-report-260814.mjs --apply --apply-review
// 운영 DB: --prod 추가
import { createClient } from "@libsql/client";
import ExcelJS from "exceljs";
import dotenv from "dotenv";

const XLSX_PATH = "C:/Users/IIamHub2/Documents/네이트온 받은 파일/2026년 맞춤형과정 주간보고_이암허브_260814.xlsx";
const SHEET_NAME = "(교육생별) 운영현황";
const APPLY = process.argv.includes("--apply");
const APPLY_REVIEW = process.argv.includes("--apply-review");
const PROD = process.argv.includes("--prod");
const IMPORT_TAG = "[주간보고260814]";
const AUTO_TOLERANCE_DAYS = 3;

if (PROD) dotenv.config({ path: ".env.vercel.prod" });
const c = PROD
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: "file:./data/app.db" });

function serialToDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return d.toISOString().slice(0, 10);
}
function dayDiff(a, b) {
  return Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000);
}

// 과정번호(예: "감귤04기","배01기") → { product, num }
function parseCourseCode(code) {
  const m = String(code).match(/^([가-힣]+?)0*(\d+)기$/);
  if (!m) return null;
  return { product: m[1], num: parseInt(m[2], 10) };
}
function parseTeamCohort(team) {
  const m = String(team.name).match(/(\d+)/);
  if (!m) return null;
  return { product: team.product, num: parseInt(m[1], 10) };
}

// ---- 1) 엑셀 읽기 (readFile이 이 파일에서 멈추므로 스트리밍 리더 사용) ----
const reader = new ExcelJS.stream.xlsx.WorkbookReader(XLSX_PATH, {});
const byCourse = new Map(); // code -> { roster, dateCounts: Map<date, count> }
let dateCols = null;

for await (const ws of reader) {
  if (ws.name !== SHEET_NAME) continue;
  let rowNum = 0;
  for await (const row of ws) {
    rowNum++;
    if (rowNum === 1) {
      dateCols = [];
      for (let col = 1; col <= 300; col++) {
        const h = row.getCell(col).value;
        if (typeof h === "string" && /^\d+일차$/.test(h)) dateCols.push(col); // 교육일자 컬럼(다음 컬럼=출석시간)
      }
      continue;
    }
    if (rowNum <= 2) continue;
    const code = row.getCell(13).value;
    if (!code) continue;
    if (!byCourse.has(code)) byCourse.set(code, { roster: 0, dateCounts: new Map() });
    const t = byCourse.get(code);
    t.roster++;
    for (const col of dateCols) {
      const v = row.getCell(col).value;
      if (typeof v === "number" && v > 40000) {
        const iso = serialToDate(v);
        t.dateCounts.set(iso, (t.dateCounts.get(iso) || 0) + 1);
      }
    }
  }
  break;
}

// ---- 2) 팀 매칭 ----
const teams = (await c.execute("SELECT id, name, product FROM teams")).rows;
const unmatched = [];
const teamActualDates = new Map(); // teamId -> { dates: string[], dateCounts, roster }

for (const [code, t] of byCourse) {
  const parsed = parseCourseCode(code);
  if (!parsed) { unmatched.push(code); continue; }
  const match = teams.find((tm) => {
    const tc = parseTeamCohort(tm);
    return tc && tc.product === parsed.product && tc.num === parsed.num;
  });
  if (!match) { unmatched.push(code); continue; }
  const dates = [...t.dateCounts.keys()].sort();
  teamActualDates.set(match.id, { teamName: match.name, code, dates, dateCounts: t.dateCounts, roster: t.roster });
}

console.log("=== 팀 매칭 ===");
for (const [teamId, info] of teamActualDates) {
  console.log(`  team_id=${teamId} (${info.teamName}) ← ${info.code}: 재적 ${info.roster}명, 실제 교육일 ${info.dates.length}건`);
}
if (unmatched.length) console.log("✗ 매칭 실패 과정번호:", unmatched.join(", "));

// ---- 3) 회차 순서보존 매칭 + 반영 ----
let totalAuto = 0, totalReview = 0, totalDrUpsert = 0;
const reviewList = [];

for (const [teamId, info] of teamActualDates) {
  const sessions = (await c.execute({
    sql: "SELECT session_no, scheduled_date, status FROM sessions WHERE team_id=? ORDER BY session_no",
    args: [teamId],
  })).rows;

  const n = Math.min(sessions.length, info.dates.length);
  if (info.dates.length > sessions.length) {
    reviewList.push(`[${info.teamName}] 실제 교육일(${info.dates.length}건)이 회차수(${sessions.length})보다 많음 — 초과 ${info.dates.length - sessions.length}건 미반영`);
  }

  const drRows = (await c.execute({
    sql: "SELECT id, session_no, source, notes FROM daily_reports WHERE team_id=?",
    args: [teamId],
  })).rows;
  const drBySession = new Map();
  for (const r of drRows) {
    if (!drBySession.has(r.session_no)) drBySession.set(r.session_no, []);
    drBySession.get(r.session_no).push(r);
  }
  const isOurs = (r) => r.source !== "manual" || (r.notes || "").startsWith(IMPORT_TAG) || (r.notes || "").startsWith("[엑셀260812]");

  for (let i = 0; i < n; i++) {
    const s = sessions[i];
    const actualDate = info.dates[i];
    const diff = Math.abs(dayDiff(s.scheduled_date, actualDate));
    const isSmall = diff <= AUTO_TOLERANCE_DAYS;
    const willApply = isSmall ? APPLY : APPLY && APPLY_REVIEW;

    if (diff > 0 || s.status !== "done") {
      const label = `[${info.teamName}] session#${s.session_no} ${s.scheduled_date} -> ${actualDate} (diff ${diff}일)${isSmall ? "" : " ⚠REVIEW"}`;
      if (isSmall) { totalAuto++; } else { totalReview++; reviewList.push(label); }
      if (totalAuto + totalReview <= 60 && isSmall) console.log("  " + label);
    }

    if (willApply) {
      await c.execute({ sql: "UPDATE sessions SET scheduled_date=?, status='done' WHERE team_id=? AND session_no=?", args: [actualDate, teamId, s.session_no] });

      const existing = drBySession.get(s.session_no) || [];
      const manual = existing.filter((r) => !isOurs(r));
      const ours = existing.filter(isOurs);
      if (manual.length === 0) {
        const attended = info.dateCounts.get(actualDate) || 0;
        const absent = Math.max(0, info.roster - attended);
        if (ours.length > 1) { for (const dup of ours.slice(1)) await c.execute({ sql: "DELETE FROM daily_reports WHERE id=?", args: [dup.id] }); }
        if (ours.length >= 1) {
          await c.execute({
            sql: "UPDATE daily_reports SET report_date=?, attended=?, absent=?, source='manual', notes=? WHERE id=?",
            args: [actualDate, attended, absent, IMPORT_TAG, ours[0].id],
          });
        } else {
          await c.execute({
            sql: "INSERT INTO daily_reports (team_id, session_no, report_date, attended, absent, source, notes) VALUES (?,?,?,?,?, 'manual', ?)",
            args: [teamId, s.session_no, actualDate, attended, absent, IMPORT_TAG],
          });
        }
        totalDrUpsert++;
      }
    }
  }
}

console.log(`\n=== ${APPLY ? "적용" : "DRY RUN (--apply로 실제 반영)"} 요약 ===`);
console.log(`자동보정(≤${AUTO_TOLERANCE_DAYS}일) 대상: ${totalAuto}건 ${APPLY ? "적용됨" : ""}`);
console.log(`daily_reports upsert: ${totalDrUpsert}건`);
console.log(`\n=== 수동 확인 필요(REVIEW, ${totalReview}건) — ${APPLY_REVIEW ? "--apply-review로 적용됨" : "--apply --apply-review 없인 미적용"} ===`);
for (const r of reviewList) console.log("  " + r);
