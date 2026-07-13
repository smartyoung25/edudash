// 일회성: agency_expenses.team_id 컬럼 추가 (마이그레이션 저널 드리프트 우회) — 로컬 + 운영 모두 적용
import { config } from "dotenv";
import fs from "fs";
import { createClient } from "@libsql/client";

async function apply(url, authToken, label) {
  const client = createClient(authToken ? { url, authToken } : { url });
  const info = await client.execute("PRAGMA table_info(agency_expenses)");
  const hasCol = info.rows.some((r) => r.name === "team_id");
  if (hasCol) {
    console.log(`· ${label} — team_id 컬럼 이미 존재, 생략`);
    return;
  }
  await client.execute("ALTER TABLE agency_expenses ADD COLUMN team_id integer REFERENCES teams(id) ON DELETE SET NULL");
  await client.execute("CREATE INDEX IF NOT EXISTS agency_expenses_team_id_idx ON agency_expenses (team_id)");
  console.log(`✓ ${label} — agency_expenses.team_id 추가 완료`);
}

// 1) 로컬 개발 DB
await apply("file:./data/app.db", null, "로컬 data/app.db");

// 2) 운영 Turso (.env.vercel.prod 가 있으면)
if (fs.existsSync(".env.vercel.prod")) {
  config({ path: ".env.vercel.prod" });
  if (process.env.TURSO_DATABASE_URL) {
    await apply(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN, "운영 Turso");
  } else {
    console.log("· .env.vercel.prod 에 TURSO 자격증명 없음 — 운영 적용 생략");
  }
} else {
  console.log("· .env.vercel.prod 없음 — 운영 적용 생략(로컬만)");
}
process.exit(0);
