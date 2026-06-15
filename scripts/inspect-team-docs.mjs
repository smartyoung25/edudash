/**
 * 딸기16기(=team id 17, "산청 청년딸기") 서류 소실 진단 — 읽기전용(SELECT만, 변경 없음).
 *
 * 목적: 팀 서류가 "총 0개"인 원인을 케이스로 확정한다.
 *   A. 미분류로 고아화/오분류(행 존재, team_id 가 NULL/다른팀)  → 재분류로 복구
 *   B. 실제 삭제(행 없음, Drive 원본은 있을 수 있음)             → 재생성
 *   C. 삭제 + mail_log 마커 잔존(재수집 차단)                    → mail_log 정리 후 재수집
 *   D. 애초 미수집(mail_log 에도 흔적 없음)                       → 발신자/별칭 점검 후 수집
 *
 * 실행: npx tsx scripts/inspect-team-docs.mjs
 *      (운영 DB 자격증명은 .env.vercel.prod 에서 로드. 로컬 테스트는
 *       TURSO_DATABASE_URL=file:./data/app.db 로 덮어쓰기 가능)
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("✗ TURSO_DATABASE_URL 미설정 — `vercel env pull .env.vercel.prod` 후 다시 실행하세요.");
  process.exit(1);
}
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const KW = "청년딸기|산청청년|딸기16|딸기 16|청년"; // 딸기16기(team17) 관련 키워드
const KW_LIKE = ["%청년딸기%", "%산청청년%", "%딸기16%", "%딸기 16%", "%청년%"];
const TARGET_TEAM = 17;

function row(o) { return JSON.stringify(o); }
function hr(t) { console.log(`\n──────── ${t} ────────`); }

// 1) 딸기/청년 관련 팀 목록 (id↔name 매핑·리넘버링 확인)
hr("1) 팀 목록 (딸기/청년)");
const teams = (await c.execute(
  `SELECT id, name, product, cohort FROM teams WHERE product='딸기' OR name LIKE '%청년%' OR name LIKE '%딸기%' ORDER BY id`
)).rows;
for (const t of teams) console.log(`  team ${t.id}: ${t.name} (${t.product}/${t.cohort})`);
const target = teams.find((t) => Number(t.id) === TARGET_TEAM);
console.log(`  → 대상 team ${TARGET_TEAM} = ${target ? `"${target.name}"` : "(없음! 리넘버링/삭제 의심)"}`);

// 2) documents teamId별 카운트
hr("2) documents 팀별 카운트");
const counts = (await c.execute(
  `SELECT COALESCE(team_id, -1) AS tid, COUNT(*) n FROM documents GROUP BY team_id ORDER BY tid`
)).rows;
const nameOf = (tid) => (tid === -1 ? "(미분류/NULL)" : (teams.find((t) => Number(t.id) === tid)?.name ?? `team ${tid}`));
for (const r of counts) console.log(`  team_id=${r.tid} (${nameOf(Number(r.tid))}): ${r.n}건`);

// 3) team 17 행 상세
hr(`3) team_id=${TARGET_TEAM} 행 상세`);
const t17 = (await c.execute({
  sql: `SELECT id, doc_type, session_no, month, source, received_at, file_name, email_from
        FROM documents WHERE team_id=? ORDER BY id`,
  args: [TARGET_TEAM],
})).rows;
console.log(`  총 ${t17.length}건`);
for (const r of t17.slice(0, 50)) console.log("   ", row(r));

// 4) 미분류/고아 후보 — 키워드 매칭
hr("4) 미분류·고아 후보 (team_id NULL 또는 doc_type=미분류 중 키워드 매칭)");
const likeClause = KW_LIKE.map(() => `file_name LIKE ? OR email_subject LIKE ? OR email_from LIKE ?`).join(" OR ");
const likeArgs = KW_LIKE.flatMap((p) => [p, p, p]);
const orphans = (await c.execute({
  sql: `SELECT id, team_id, doc_type, source, month, session_no, received_at, file_name, email_from, email_subject
        FROM documents
        WHERE (team_id IS NULL OR doc_type='미분류') AND (${likeClause})
        ORDER BY received_at DESC`,
  args: likeArgs,
})).rows;
console.log(`  매칭 ${orphans.length}건` + (orphans.length ? " — 이 행들이 재분류 복구 대상(케이스 A) 후보" : ""));
for (const r of orphans.slice(0, 50)) console.log("   ", row(r));

// 4a) FK set-null 고아 탐지(키워드 무관) — team_id NULL 인데 doc_type 이 미분류가 아님.
//     = 원래 분류돼 있던 문서가 팀 행 삭제로 team_id 만 NULL 로 떨어진 강력한 신호(가설 1).
hr("4a) FK set-null 고아 (team_id IS NULL AND doc_type != '미분류')");
const setNullOrphans = (await c.execute(
  `SELECT id, doc_type, source, month, session_no, received_at, file_name, email_from, email_subject
   FROM documents WHERE team_id IS NULL AND doc_type <> '미분류' ORDER BY received_at DESC`
)).rows;
console.log(`  ${setNullOrphans.length}건` + (setNullOrphans.length ? " — 팀 행 삭제로 고아화된 강력 신호(케이스 A). email_from 으로 어느 팀인지 식별 가능" : ""));
const orphanByType = {};
for (const r of setNullOrphans) orphanByType[r.doc_type] = (orphanByType[r.doc_type] ?? 0) + 1;
if (setNullOrphans.length) console.log("  doc_type 분포:", row(orphanByType));
for (const r of setNullOrphans.slice(0, 50)) console.log("   ", row(r));

// 4b) 키워드 매칭 전체(팀 무관) — 다른 팀으로 오분류됐는지 확인
hr("4b) 키워드 매칭 documents 전체 (오분류 탐지)");
const anyMatch = (await c.execute({
  sql: `SELECT id, team_id, doc_type, source, file_name, email_from
        FROM documents WHERE (${likeClause}) ORDER BY team_id`,
  args: likeArgs,
})).rows;
console.log(`  매칭 ${anyMatch.length}건 (team_id 분포 주목)`);
const byTeam = {};
for (const r of anyMatch) { const k = r.team_id ?? "NULL"; byTeam[k] = (byTeam[k] ?? 0) + 1; }
console.log("  team_id 분포:", row(byTeam));

// 5) team_aliases (team 17 라우팅 점검)
hr("5) team_aliases (team 17 / 키워드)");
const aliases = (await c.execute({
  sql: `SELECT team_id, alias FROM team_aliases WHERE team_id=? OR alias LIKE '%청년%' OR alias LIKE '%딸기16%' OR alias LIKE '%딸기 16%' ORDER BY team_id`,
  args: [TARGET_TEAM],
})).rows;
for (const a of aliases) console.log(`  team ${a.team_id}: ${a.alias}`);

// 6) mail_log — 원래 수집 이력 + 재수집 차단 여부
hr("6) mail_log (키워드/분류팀=17 메시지)");
const logs = (await c.execute({
  sql: `SELECT id, message_id, from_address, subject, received_at, classified_team_id, classified_doc_type, processed_status
        FROM mail_log
        WHERE classified_team_id=? OR subject LIKE '%청년%' OR subject LIKE '%딸기16%' OR subject LIKE '%딸기 16%' OR subject LIKE '%산청청년%'
        ORDER BY received_at DESC`,
  args: [TARGET_TEAM],
})).rows;
console.log(`  매칭 ${logs.length}건` + (logs.length ? " — 수집 이력 있음(행이 없으면 케이스 C: 마커만 잔존→재수집 차단)" : " — 수집 이력 없음(케이스 D 가능)"));
for (const r of logs.slice(0, 50)) console.log("   ", row(r));

// 7) 케이스 자동 힌트
hr("진단 힌트");
if (t17.length > 0) {
  console.log("  • team 17 에 행이 있음 → 화면 0개라면 표시/세션매칭 문제 재확인 필요.");
} else if (setNullOrphans.length > 0) {
  console.log("  ▶ 케이스 A(고아화) 유력: team_id=NULL인데 doc_type 이 살아있는 행 존재 = 팀 행 삭제로 분리됨.");
  console.log("    → 해당 행들의 email_from 으로 청년딸기 코디 메일을 식별해 team_id=17 재분류로 복구.");
} else if (orphans.length > 0) {
  console.log("  ▶ 케이스 A 유력: 행은 살아있고 미분류/오분류 상태. 재분류(team_id=17)로 복구 가능.");
} else if (logs.length > 0) {
  console.log("  ▶ 케이스 C 유력: documents 행은 없고 mail_log 마커만 잔존 → 해당 message_id mail_log 삭제 후 재수집(--rescan).");
} else {
  console.log("  ▶ 케이스 B/D 가능: 행도 로그도 없음. Drive 원본 확인 또는 발신자/별칭 점검 후 재수집.");
}
console.log("\n완료(읽기전용).");
process.exit(0);
