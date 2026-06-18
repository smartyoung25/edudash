/**
 * 미분류 문서 진단 — 읽기전용(SELECT만).
 * 목적: "미분류 처리 건에 다른 프로젝트(병행 사업) 서류" 가 섞인 원인 식별.
 *   - 발신자(email_from) 별로 묶어 어떤 코디/교수 메일에서 들어왔는지
 *   - 제목/파일명으로 어느 사업인지 단서 확보
 * 실행: npx tsx scripts/inspect-unclassified.mjs
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("✗ TURSO_DATABASE_URL 미설정 — .env.vercel.prod 확인");
  process.exit(1);
}
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const j = (o) => JSON.stringify(o);
const hr = (t) => console.log(`\n──────── ${t} ────────`);

// 1) 미분류/고아 전체 건수
hr("1) 미분류·고아 건수");
const cnt = (await c.execute(
  `SELECT COUNT(*) n FROM documents WHERE doc_type='미분류' OR team_id IS NULL`
)).rows;
console.log(`  doc_type=미분류 OR team_id IS NULL: ${cnt[0].n}건`);

// 2) 발신자별 분포 (미분류)
hr("2) 미분류 발신자별 분포");
const byFrom = (await c.execute(
  `SELECT COALESCE(email_from,'(없음)') ef, COUNT(*) n
   FROM documents WHERE doc_type='미분류' OR team_id IS NULL
   GROUP BY email_from ORDER BY n DESC`
)).rows;
for (const r of byFrom) console.log(`  ${r.ef}: ${r.n}건`);

// 3) 미분류 상세 (제목/파일명/수신일)
hr("3) 미분류 상세 (최근순, 최대 80건)");
const rows = (await c.execute(
  `SELECT id, team_id, doc_type, source, session_no, month, received_at,
          file_name, email_from, email_subject
   FROM documents WHERE doc_type='미분류' OR team_id IS NULL
   ORDER BY received_at DESC LIMIT 80`
)).rows;
for (const r of rows) console.log("   ", j(r));

// 4) 코디/교수 이메일이 어느 팀에 매핑돼 있는지 (공유 이메일 탐지)
hr("4) 미분류 발신자가 teams.coordinator/professor 에 매핑된 곳");
for (const r of byFrom) {
  const ef = String(r.ef).toLowerCase();
  if (ef === "(없음)") continue;
  const m = (await c.execute({
    sql: `SELECT id, name, product, cohort, coordinator_email, professor_email
          FROM teams WHERE LOWER(coordinator_email)=? OR LOWER(professor_email)=?`,
    args: [ef, ef],
  })).rows;
  if (m.length) console.log(`  ${ef} → ` + m.map((t) => `team${t.id} ${t.name}`).join(", "));
  else console.log(`  ${ef} → (teams에 매핑 없음 = 코드 override 또는 users 경유)`);
}

console.log("\n완료(읽기전용).");
process.exit(0);
