import { createClient } from "@libsql/client";

// 카테고리별 허용 일수
const TOLERANCE_BY_CAT = {
  "재료비": 999,            // 가장 가까운 회차 (사전/사후 구매)
  "다과": 999,              // 가장 가까운 회차
  "강사비": 14,
  "퍼실리테이터비용": 14,
  "식대": 0,                // 당일만 (현장 식사)
};
const DEFAULT_TOLERANCE = 1;

const c = createClient({ url: "file:./data/app.db" });

function diffDays(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}
function isValidDate(d) {
  if (!d) return false;
  const dt = new Date(d);
  if (isNaN(dt)) return false;
  const y = dt.getFullYear();
  return y >= 2025 && y <= 2030;
}

function findSession(sessions, spentDate, category) {
  if (!isValidDate(spentDate)) return null;
  for (const s of sessions) if (s.date === spentDate) return s.no;
  const tolerance = TOLERANCE_BY_CAT[category] ?? DEFAULT_TOLERANCE;
  let best = null;
  for (const s of sessions) {
    const d = Math.abs(diffDays(spentDate, s.date));
    if (d <= tolerance && (!best || d < best.d)) best = { no: s.no, d };
  }
  return best?.no ?? null;
}

const teams = (await c.execute("SELECT id, name FROM teams ORDER BY id")).rows;
let grandUpdated = 0;
let grandUnmatched = 0;

for (const t of teams) {
  const sessions = (await c.execute({
    sql: "SELECT session_no, scheduled_date FROM sessions WHERE team_id=? ORDER BY scheduled_date",
    args: [t.id],
  })).rows.map(r => ({ no: Number(r.session_no), date: r.scheduled_date }));

  if (sessions.length === 0) continue;

  const unassigned = (await c.execute({
    sql: "SELECT id, spent_date, total_amount, vendor_name, category FROM expenses WHERE team_id=? AND session_no IS NULL ORDER BY spent_date",
    args: [t.id],
  })).rows;

  if (unassigned.length === 0) continue;

  console.log(`\n=== ${t.name} (id=${t.id}) — 미지정 ${unassigned.length}건 ===`);
  let teamUpdated = 0;
  for (const e of unassigned) {
    const sno = findSession(sessions, e.spent_date, e.category);
    if (!sno) {
      console.log(`  ${e.spent_date} ${e.category} ${Number(e.total_amount).toLocaleString()} → 매칭 없음`);
      grandUnmatched++;
      continue;
    }
    await c.execute({ sql: "UPDATE expenses SET session_no=? WHERE id=?", args: [sno, e.id] });
    console.log(`  ${e.spent_date} ${e.category} ${Number(e.total_amount).toLocaleString()} (${e.vendor_name || "-"}) → ${sno}회차`);
    teamUpdated++;
  }
  console.log(`  → ${teamUpdated}건 지정`);
  grandUpdated += teamUpdated;
}
console.log(`\n총 ${grandUpdated}건 회차 지정, ${grandUnmatched}건 미매칭`);
