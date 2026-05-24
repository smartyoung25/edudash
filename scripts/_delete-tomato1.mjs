import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./data/app.db" });
const TID = 33;

const [exists] = (await c.execute({ sql: "SELECT id, name FROM teams WHERE id=?", args: [TID] })).rows;
if (!exists) { console.log("이미 없음"); process.exit(0); }
console.log("삭제 대상:", exists.id, exists.name);

const tables = ["expenses", "expense_budgets", "kpi_definitions", "documents", "contacts", "team_aliases"];
for (const t of tables) {
  try {
    const r = await c.execute({ sql: `DELETE FROM ${t} WHERE team_id=?`, args: [TID] });
    console.log(`  ${t}: ${r.rowsAffected ?? 0}건 삭제`);
  } catch (e) { console.log(`  ${t}: SKIP (${e.message.split(':')[0]})`); }
}
try {
  const r = await c.execute({ sql: "UPDATE users SET team_id=NULL WHERE team_id=?", args: [TID] });
  console.log(`  users.team_id=NULL: ${r.rowsAffected ?? 0}건`);
} catch (e) { console.log(`  users: SKIP`); }

const r = await c.execute({ sql: "DELETE FROM teams WHERE id=?", args: [TID] });
console.log(`teams: ${r.rowsAffected ?? 0}건 삭제 ✓`);
