/**
 * 주간보고서 — "(교육생별) 운영현황" 시트 하나만 산출
 * 출력: data/weekly-students-YYYYMMDD.xlsx
 */
import { createClient } from "@libsql/client";
import ExcelJS from "exceljs";
import fs from "fs";

const c = createClient({ url: "file:./data/app.db" });
const today = new Date().toISOString().slice(0, 10);
const outPath = `data/weekly-students-${today.replace(/-/g, "")}.xlsx`;

const teams = (await c.execute("SELECT id, name, cohort FROM teams ORDER BY id")).rows;
const members = (await c.execute("SELECT id, team_id, name, edu_status FROM members ORDER BY team_id, id")).rows;
const sessions = (await c.execute("SELECT id, team_id, session_no FROM sessions")).rows;
const attendance = (await c.execute("SELECT session_id, member_id, status FROM attendance")).rows;

// KPI: 회원당 평균 % (정의/진행 둘 다 있어야 계산)
const kpiDefs = (await c.execute("SELECT id, team_id, name, target_value FROM kpi_definitions")).rows;
const kpiProg = (await c.execute("SELECT member_id, kpi_def_id, baseline, mid_checkpoints, final_value FROM kpi_progress")).rows;

const teamSessionsByTeam = new Map();
for (const s of sessions) {
  if (!teamSessionsByTeam.has(s.team_id)) teamSessionsByTeam.set(s.team_id, []);
  teamSessionsByTeam.get(s.team_id).push(s.id);
}

function attForMember(memberId, teamId) {
  const sids = new Set(teamSessionsByTeam.get(teamId) || []);
  const rows = attendance.filter((a) => a.member_id === memberId && sids.has(a.session_id));
  const present = rows.filter((r) => r.status === "present").length;
  const total = rows.length;
  const absent = total - present;
  const rate = total === 0 ? 0 : Math.round((present / total) * 100);
  return { total, present, absent, rate };
}

function kpiAvgForMember(memberId, teamId) {
  const defs = kpiDefs.filter((d) => d.team_id === teamId);
  if (defs.length === 0) return 0;
  let sum = 0, n = 0;
  for (const d of defs) {
    const pr = kpiProg.find((p) => p.member_id === memberId && p.kpi_def_id === d.id);
    if (!pr) continue;
    const latest = pr.final_value ?? (() => {
      try { const arr = JSON.parse(pr.mid_checkpoints || "[]"); return arr.length ? arr[arr.length - 1].value : pr.baseline; }
      catch { return pr.baseline; }
    })();
    const tgt = Number(d.target_value);
    if (!tgt) continue;
    const pct = Math.min(100, Math.max(0, Math.round((Number(latest) / tgt) * 100)));
    sum += pct; n++;
  }
  return n === 0 ? 0 : Math.round(sum / n);
}

const wb = new ExcelJS.Workbook();
wb.creator = "성장농 교육운영 시스템";
wb.created = new Date();

const ws = wb.addWorksheet("(교육생별) 운영현황");
ws.columns = [
  { header: "팀명", key: "team", width: 22 },
  { header: "기수", key: "cohort", width: 10 },
  { header: "교육생", key: "name", width: 12 },
  { header: "총 차시", key: "total", width: 10 },
  { header: "출석", key: "attended", width: 8 },
  { header: "결석", key: "absent", width: 8 },
  { header: "출석률(%)", key: "rate", width: 12 },
  { header: "KPI 평균(%)", key: "kpi", width: 14 },
  { header: "교육상태", key: "edu", width: 12 },
];
ws.getRow(1).font = { bold: true };
ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EA" } };

const teamMap = new Map(teams.map((t) => [t.id, t]));
let rowCount = 0;
for (const m of members) {
  const t = teamMap.get(m.team_id);
  if (!t) continue;
  const a = attForMember(m.id, m.team_id);
  const kpi = kpiAvgForMember(m.id, m.team_id);
  ws.addRow({
    team: t.name,
    cohort: t.cohort,
    name: m.name,
    total: a.total,
    attended: a.present,
    absent: a.absent,
    rate: a.rate,
    kpi,
    edu: m.edu_status || "",
  });
  rowCount++;
}

ws.spliceRows(1, 0,
  ["2026 성장농 맞춤형과정 주간 운영현황 — 교육생별"],
  [`작성일: ${today} / 작성: (주)이암허브`],
  [],
);
ws.mergeCells("A1:I1");
ws.getRow(1).font = { bold: true, size: 14 };
ws.getRow(1).alignment = { horizontal: "center" };
ws.mergeCells("A2:I2");
ws.getRow(2).alignment = { horizontal: "center" };

const buf = await wb.xlsx.writeBuffer();
fs.writeFileSync(outPath, Buffer.from(buf));
console.log(`✓ ${outPath} (학생 ${rowCount}행)`);
