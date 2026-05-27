// 포도3기(안산명품포도) 일정이 전부 "취소"로 표시되는 원인 진단
// 실행: node scripts/diagnose-podo3.mjs
import { createClient } from "@libsql/client";

const c = createClient({ url: "file:./data/app.db" });
const TODAY = new Date().toISOString().slice(0, 10);

function row(...cells) { return cells.map((s) => String(s ?? "").padEnd(0)).join(" | "); }

console.log("=== 0) 안산명품포도 팀 정보 ===");
// 실제 DB에는 name='포도3', product='포도', cohort='포도3' 으로 들어있음 (seed 'teams.ts'와 표기 다름)
const teamRes = await c.execute("SELECT id, name, cohort, product, total_sessions, end_date FROM teams WHERE product='포도' AND (cohort LIKE '%3%' OR name LIKE '%포도3%' OR name='안산명품포도')");
if (teamRes.rows.length === 0) {
  console.log("  ✗ teams에 안산명품포도가 없습니다. seed 또는 매핑 확인 필요.");
  process.exit(0);
}
for (const t of teamRes.rows) console.log(`  후보: id=${t.id} | ${t.name} | ${t.product}/${t.cohort} | total=${t.total_sessions} | end=${t.end_date}`);
const team = teamRes.rows[0];
const teamId = team.id;
console.log(`  ▶ 사용 team_id=${teamId}`);

console.log(`\n=== 1) sessions (총건수·과거/오늘/미래) — TODAY=${TODAY} ===`);
const sess = await c.execute({ sql: "SELECT session_no, subject, scheduled_date, status FROM sessions WHERE team_id=? ORDER BY session_no", args: [teamId] });
let past = 0, today = 0, future = 0;
for (const r of sess.rows) {
  if (r.scheduled_date < TODAY) past++;
  else if (r.scheduled_date === TODAY) today++;
  else future++;
}
console.log(`  총 ${sess.rows.length}건 — past=${past}, today=${today}, future=${future}`);
console.log("  처음 5건:");
for (const r of sess.rows.slice(0, 5)) console.log(`    #${r.session_no} ${r.scheduled_date} [${r.status}] ${r.subject}`);
console.log("  마지막 5건:");
for (const r of sess.rows.slice(-5)) console.log(`    #${r.session_no} ${r.scheduled_date} [${r.status}] ${r.subject}`);

console.log(`\n=== 2) daily_reports — team_id=${teamId} ===`);
const dr = await c.execute({ sql: "SELECT session_no, report_date, attended, absent, source FROM daily_reports WHERE team_id=? ORDER BY session_no", args: [teamId] });
console.log(`  총 ${dr.rows.length}건`);
if (dr.rows.length > 0) {
  for (const r of dr.rows.slice(0, 10)) console.log(`    #${r.session_no} ${r.report_date} 출석=${r.attended} 결석=${r.absent} src=${r.source}`);
  if (dr.rows.length > 10) console.log(`    ... 외 ${dr.rows.length - 10}건`);
}

console.log("\n=== 3) team_aliases (포도/안산) ===");
const al = await c.execute({ sql: "SELECT team_id, alias FROM team_aliases WHERE alias LIKE '%포도%' OR alias LIKE '%안산%' ORDER BY team_id", args: [] });
for (const r of al.rows) console.log(`  team_id=${r.team_id} | "${r.alias}"`);
if (al.rows.length === 0) console.log("  (없음)");

console.log("\n=== 4) 오할당 의심 — 다른 팀 daily_reports 중 subject/notes에 '포도' 또는 '안산' 포함 ===");
const cross = await c.execute({
  sql: "SELECT team_id, session_no, report_date, subject, source FROM daily_reports WHERE team_id != ? AND (subject LIKE '%포도%' OR subject LIKE '%안산%' OR notes LIKE '%안산%포도%') ORDER BY report_date LIMIT 30",
  args: [teamId],
});
console.log(`  ${cross.rows.length}건`);
for (const r of cross.rows) console.log(`    team=${r.team_id} #${r.session_no} ${r.report_date} src=${r.source} subj="${(r.subject || '').slice(0, 50)}"`);

console.log("\n=== 5) mail_log — 안산/포도 관련 분류 결과 ===");
const ml = await c.execute({
  sql: "SELECT id, from_address, subject, classified_team_id, processed_status FROM mail_log WHERE subject LIKE '%안산%' OR subject LIKE '%포도%' ORDER BY id DESC LIMIT 20",
});
console.log(`  ${ml.rows.length}건`);
for (const r of ml.rows) console.log(`    #${r.id} from=${r.from_address} cls_team=${r.classified_team_id ?? '-'} status=${r.processed_status} subj="${(r.subject || '').slice(0, 50)}"`);

console.log("\n=== 6) documents — 안산명품포도 팀 서류 건수·종류 ===");
const docs = await c.execute({
  sql: "SELECT doc_type, COUNT(*) as n FROM documents WHERE team_id=? GROUP BY doc_type",
  args: [teamId],
});
for (const r of docs.rows) console.log(`    ${r.doc_type}: ${r.n}건`);
if (docs.rows.length === 0) console.log("  (없음)");

console.log("\n=== 진단 요약 ===");
const isUncollected = dr.rows.length === 0 && past > 0;
const hasMisassigned = cross.rows.length > 0;
console.log(`  past(미진행 후보) 차시: ${past}`);
console.log(`  해당 팀 daily_reports: ${dr.rows.length}`);
console.log(`  타팀 일지 중 '포도/안산' 포함: ${cross.rows.length}`);
if (isUncollected && !hasMisassigned) {
  console.log("  → [케이스A] 데이터 미수집. 강제 재동기화(시트/메일/Drive) 필요.");
} else if (hasMisassigned) {
  console.log("  → [케이스B] 다른 팀으로 잘못 분류됨. import 매처 로직 수정 + 재분류 필요.");
} else if (dr.rows.length > 0 && past > dr.rows.length) {
  console.log("  → [부분 미수집] 일부 차시 누락. 누락 회차 확인 필요.");
} else {
  console.log("  → 추가 조사 필요. mail_log/documents 출력 참고.");
}

process.exit(0);
