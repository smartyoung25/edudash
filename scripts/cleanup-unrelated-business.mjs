/**
 * 무관 병행사업(aT 스마트 수출전문단지 구축사업) 오수집 서류 정리.
 *   - 제목 또는 파일명에 "수출전문단지" 가 포함된 documents 행 삭제.
 *   - 기본은 DRY-RUN(미삭제). 실제 삭제는 `--apply` 인자를 줄 때만.
 * 실행: npx tsx scripts/cleanup-unrelated-business.mjs          (미리보기)
 *      npx tsx scripts/cleanup-unrelated-business.mjs --apply  (삭제 실행)
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--apply");
const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("✗ TURSO_DATABASE_URL 미설정 — .env.vercel.prod 확인");
  process.exit(1);
}
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const KW = "%수출전문단지%";
const rows = (await c.execute({
  sql: `SELECT id, team_id, doc_type, file_name, email_from, email_subject
        FROM documents
        WHERE email_subject LIKE ? OR file_name LIKE ?
        ORDER BY id`,
  args: [KW, KW],
})).rows;

console.log(`대상 ${rows.length}건 (제목/파일명에 "수출전문단지" 포함):`);
for (const r of rows) {
  console.log(`  #${r.id} team=${r.team_id} [${r.doc_type}] ${r.file_name}  ← ${r.email_from} / ${r.email_subject}`);
}

if (rows.length === 0) {
  console.log("\n삭제할 항목 없음.");
  process.exit(0);
}

if (!APPLY) {
  console.log(`\n[DRY-RUN] 실제 삭제하려면 --apply 를 붙여 다시 실행하세요.`);
  process.exit(0);
}

const ids = rows.map((r) => Number(r.id));
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200);
  await c.execute({
    sql: `DELETE FROM documents WHERE id IN (${batch.map(() => "?").join(",")})`,
    args: batch,
  });
}
console.log(`\n✓ ${ids.length}건 삭제 완료.`);
process.exit(0);
