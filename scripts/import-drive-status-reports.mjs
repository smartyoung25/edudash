// data/drive-team-status.xlsx 의 모든 시트 → daily_reports upsert
// 실행: node scripts/import-drive-status-reports.mjs
import { createClient } from "@libsql/client";
import ExcelJS from "exceljs";

const c = createClient({ url: "file:./data/app.db" });

function cellStr(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && "result" in val) return String(val.result ?? "");
  if (val instanceof Date) return val.toISOString();
  return String(val).trim();
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,"0")}-${String(val.getDate()).padStart(2,"0")}`;
  }
  const s = cellStr(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  if (s.includes("GMT")) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  let m = s.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return `2026-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  m = s.replace(/^\.+/, "").match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m) return `2026-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  return null;
}

function parseSheet(ws) {
  let dateRow=-1, attendedRow=-1, absentRow=-1, subjectRow=-1;
  const KW = { date:["시행 일시","수업일자","시행일시","교육일자"], attended:["참여 인원","참여인원","출석인원","출석"], absent:["불참자","결석자","불참"], subject:["교육주제","수업주제","주제"] };
  for (let r=1; r<=Math.min(20, ws.rowCount); r++) {
    const label = cellStr(ws.getRow(r).getCell(1).value).replace(/\s/g,"");
    if (KW.date.some(k=>label.includes(k.replace(/\s/g,"")))) dateRow=r;
    if (KW.attended.some(k=>label.includes(k.replace(/\s/g,"")))) attendedRow=r;
    if (KW.absent.some(k=>label.includes(k.replace(/\s/g,"")))) absentRow=r;
    if (KW.subject.some(k=>label.includes(k.replace(/\s/g,"")))) subjectRow=r;
  }
  if (dateRow===-1) return [];
  const headerRow = ws.getRow(1);
  const cols = [];
  for (let c=2; c<=ws.columnCount; c++) {
    const h = cellStr(headerRow.getCell(c).value);
    const m = h.match(/^(\d+)차/);
    if (m) cols.push({ col:c, no: parseInt(m[1]) });
  }
  const out = [];
  for (const {col, no} of cols) {
    const reportDate = parseDate(ws.getRow(dateRow).getCell(col).value);
    if (!reportDate) continue;
    const subject = cellStr(ws.getRow(subjectRow>0?subjectRow:dateRow).getCell(col).value);
    const attended = parseInt(cellStr(ws.getRow(attendedRow>0?attendedRow:dateRow).getCell(col).value)) || 0;
    let absentNames="", absent=0;
    if (absentRow>0) {
      const raw = cellStr(ws.getRow(absentRow).getCell(col).value);
      if (raw && raw!=="X" && raw!=="x" && raw!=="-") {
        absentNames = raw;
        absent = raw.split(/[,、\n]/).filter(s=>s.trim()).length;
      }
    }
    out.push({ sessionNo: no, reportDate, subject, attended, absent, absentNames });
  }
  return out;
}

function norm(s) { return String(s).replace(/\s/g, "").toLowerCase(); }

async function matchTeam(sheetName, teams, aliases) {
  const sn = norm(sheetName);
  for (const t of teams) if (norm(t.name) === sn) return t.id;
  for (const t of teams) {
    const tn = norm(t.name);
    if (sn.includes(tn) || tn.includes(sn)) return t.id;
  }
  for (const a of aliases) if (norm(a.alias) === sn) return a.team_id;
  return null;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("data/drive-team-status.xlsx");

const teamsRes = await c.execute("SELECT id, name FROM teams");
const aliasRes = await c.execute("SELECT team_id, alias FROM team_aliases");
const teams = teamsRes.rows;
const aliases = aliasRes.rows;

let total = 0, perTeam = [];
for (const ws of wb.worksheets) {
  const sheetName = ws.name.trim();
  const teamId = await matchTeam(sheetName, teams, aliases);
  if (!teamId) { console.log(`  ✗ 매칭실패: ${sheetName}`); continue; }
  const rows = parseSheet(ws);
  let n = 0;
  for (const s of rows) {
    try {
      const ex = await c.execute({ sql: "SELECT id FROM daily_reports WHERE team_id=? AND session_no=? AND report_date=?", args: [teamId, s.sessionNo, s.reportDate] });
      if (ex.rows.length > 0) {
        await c.execute({ sql: "UPDATE daily_reports SET subject=COALESCE(?, subject), attended=?, absent=?, absent_names=?, source='sheet' WHERE id=?", args: [s.subject || null, s.attended, s.absent, s.absentNames || null, ex.rows[0].id] });
      } else {
        await c.execute({ sql: "INSERT INTO daily_reports (team_id, session_no, report_date, subject, attended, absent, absent_names, source) VALUES (?,?,?,?,?,?,?, 'sheet')", args: [teamId, s.sessionNo, s.reportDate, s.subject || null, s.attended, s.absent, s.absentNames || null] });
      }
      n++;
    } catch (e) { console.log(`    err ${sheetName} #${s.sessionNo}:`, e.message); }
  }
  perTeam.push({ sheet: sheetName, teamId, n });
  total += n;
}
console.log("\n=== 결과 ===");
for (const t of perTeam) console.log(`  team_id=${t.teamId} (${t.sheet}): ${t.n}건`);
console.log(`총 ${total}건 upsert`);
