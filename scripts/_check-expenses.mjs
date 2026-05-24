import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./data/app.db" });

for (const tid of [18, 20, 21, 29, 30]) {
  const r = await c.execute({ sql: "SELECT id, name FROM teams WHERE id=?", args: [tid] });
  const t = r.rows[0];
  const e = await c.execute({ sql: "SELECT COUNT(*) as n FROM expenses WHERE team_id=?", args: [tid] });
  const src = await c.execute({ sql: "SELECT source, COUNT(*) as n FROM expenses WHERE team_id=? GROUP BY source", args: [tid] });
  console.log(`team ${tid} (${t?.name}): expenses=${e.rows[0].n}`);
  for (const s of src.rows) console.log(`  source=${s.source}: ${s.n}`);
}

console.log("\n=== ingest_logs (있다면 최근 10건) ===");
try {
  const logs = await c.execute("SELECT * FROM ingest_logs ORDER BY id DESC LIMIT 10");
  for (const l of logs.rows) console.log(l);
} catch (e) { console.log("ingest_logs 없음"); }
