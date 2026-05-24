import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./data/app.db" });

console.log("=== 토마토 product 팀 ===");
const tom = await c.execute("SELECT id, name, cohort, product, coordinator_email FROM teams WHERE product='토마토'");
for (const r of tom.rows) console.log(r.id, '|', r.name, '|', r.cohort, '|', r.coordinator_email ?? '(없음)');

console.log("\n=== 별칭에 '토마토' 또는 '1기' 포함 ===");
const al = await c.execute("SELECT team_id, alias FROM team_aliases WHERE alias LIKE '%토마토%' OR alias LIKE '%1기%' ORDER BY team_id");
for (const r of al.rows) console.log(r.team_id, '|', r.alias);

console.log("\n=== 전체 팀 + 코디 메일 ===");
const all = await c.execute("SELECT id, name, cohort, product, coordinator_name, coordinator_email FROM teams ORDER BY id");
for (const r of all.rows) console.log(String(r.id).padStart(2), '|', String(r.product).padEnd(4), String(r.cohort).padEnd(8), '|', String(r.name).padEnd(20), '|', String(r.coordinator_name ?? '-').padEnd(8), '|', r.coordinator_email ?? '(없음)');

console.log("\n=== id 33 (토마토1기) 관련 데이터 카운트 ===");
for (const tbl of ['expenses','expense_budgets','team_members','documents','contacts','weekly_reports','team_sessions']) {
  try {
    const r = await c.execute({ sql: `SELECT COUNT(*) as n FROM ${tbl} WHERE team_id=?`, args: [33] });
    console.log(tbl, '=', r.rows[0].n);
  } catch (e) { console.log(tbl, 'ERR:', e.message); }
}
try {
  const r = await c.execute({ sql: "SELECT COUNT(*) as n FROM kpi_definitions WHERE team_id=?", args: [33] });
  console.log('kpi_definitions =', r.rows[0].n);
} catch (e) { console.log('kpi_definitions ERR:', e.message); }
