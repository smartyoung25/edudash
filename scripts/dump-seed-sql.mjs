// 로컬 data/app.db → Turso 적용용 INSERT SQL 덤프
// 사용: node scripts/dump-seed-sql.mjs > seed-inserts.sql
import { createClient } from "@libsql/client";

const client = createClient({ url: "file:./data/app.db" });

const TABLES_IN_ORDER = [
  "teams",
  "users",
  "members",
  "sessions",
  "attendance",
  "documents",
  "weekly_reports",
  "audit_logs",
  "login_attempts",
];

function quote(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) return "X'" + Buffer.from(v).toString("hex") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const out = [];
out.push("PRAGMA defer_foreign_keys = ON;");
out.push("BEGIN;");

for (const t of TABLES_IN_ORDER) {
  let res;
  try {
    res = await client.execute(`SELECT * FROM ${t}`);
  } catch (e) {
    console.error(`-- skip ${t}: ${e.message}`);
    continue;
  }
  if (res.rows.length === 0) {
    out.push(`-- ${t}: empty`);
    continue;
  }
  const cols = res.columns;
  const colList = cols.map((c) => `"${c}"`).join(", ");
  out.push(`-- ${t}: ${res.rows.length} rows`);
  for (const row of res.rows) {
    const vals = cols.map((c) => quote(row[c])).join(", ");
    out.push(`INSERT INTO "${t}" (${colList}) VALUES (${vals});`);
  }
}

out.push("COMMIT;");
process.stdout.write(out.join("\n") + "\n");
