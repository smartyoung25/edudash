// 일회성: agency_expenses(출장비) 기존 행에 trip_name 기반으로 team_id 채우기
// tripName 앞의 "[2026 성장농]" 같은 사업명 대괄호 접두어는 제거 후 매칭한다.
// (그렇지 않으면 "성장농"이 감귤6기 별칭이라 전부 감귤6기로 오매칭됨)
// 실행: node scripts/backfill-agency-trip-team.mjs [--prod] [--apply]
//   --apply 없이 실행하면 dry-run(매칭 결과만 출력, DB 반영 안 함)
import { config } from "dotenv";
import fs from "fs";
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");

function stripBracketPrefix(s) {
  return s.replace(/^(\s*\[[^\]]*\]\s*)+/, "").trim();
}

async function run(url, authToken, label) {
  const client = createClient(authToken ? { url, authToken } : { url });

  const aliasRes = await client.execute("SELECT team_id, alias FROM team_aliases");
  const aliases = aliasRes.rows
    .map((r) => ({ teamId: r.team_id, alias: String(r.alias) }))
    .sort((a, b) => b.alias.length - a.alias.length);

  const rowsRes = await client.execute(
    "SELECT id, trip_name FROM agency_expenses WHERE kind='출장비' AND team_id IS NULL AND trip_name IS NOT NULL"
  );

  let matched = 0;
  const unmatched = new Set();
  for (const row of rowsRes.rows) {
    const cleaned = stripBracketPrefix(String(row.trip_name)).toLowerCase();
    const hit = aliases.find((a) => cleaned.includes(a.alias.toLowerCase()));
    if (hit) {
      matched++;
      if (APPLY) {
        await client.execute({
          sql: "UPDATE agency_expenses SET team_id = ? WHERE id = ?",
          args: [hit.teamId, row.id],
        });
      }
    } else {
      unmatched.add(row.trip_name);
    }
  }

  console.log(`\n[${label}] 대상 ${rowsRes.rows.length}건 — 매칭 ${matched}건, 미매칭 ${rowsRes.rows.length - matched}건${APPLY ? " (DB 반영 완료)" : " (dry-run, --apply로 반영)"}`);
  if (unmatched.size > 0) {
    console.log("미매칭 출장명 (수동 배정 필요):");
    for (const t of unmatched) console.log(`  - ${t}`);
  }
}

if (PROD) {
  if (!fs.existsSync(".env.vercel.prod")) {
    console.log("· .env.vercel.prod 없음 — 운영 실행 불가");
    process.exit(1);
  }
  config({ path: ".env.vercel.prod" });
  if (!process.env.TURSO_DATABASE_URL) {
    console.log("· TURSO 자격증명 없음 — 운영 실행 불가");
    process.exit(1);
  }
  await run(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN, "운영 Turso");
} else {
  await run("file:./data/app.db", null, "로컬 data/app.db");
}
process.exit(0);
