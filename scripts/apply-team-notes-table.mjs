// 일회성: team_notes 테이블 생성 (마이그레이션 저널 드리프트 우회) — 로컬 + 운영 모두 적용
import { config } from "dotenv";
import fs from "fs";
import { createClient } from "@libsql/client";

const DDL = [
  `CREATE TABLE IF NOT EXISTS team_notes (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    team_id integer NOT NULL,
    note_date text NOT NULL,
    content text NOT NULL,
    created_by integer,
    created_by_name text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS team_notes_team_id_idx ON team_notes (team_id)`,
];

async function apply(url, authToken, label) {
  const client = createClient(authToken ? { url, authToken } : { url });
  for (const sql of DDL) await client.execute(sql);
  console.log(`✓ ${label} — team_notes 생성 완료`);
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
