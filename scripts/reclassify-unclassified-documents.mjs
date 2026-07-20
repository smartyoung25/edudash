/**
 * 미분류(doc_type='미분류') 서류 일괄 재분류 (일회성).
 *
 * 배경: /documents 화면 "미분류 서류" 199건을 조사한 결과 대부분은 team_aliases에
 *       빠진 별칭(완주반·낙안반·인제·청주·오창)과 classifyDocType() 키워드 누락
 *       (교육일지·코디 보고서·수강생일지·출장비 품의서 등) 때문이었다. 코드(classifier.ts)와
 *       별칭 시드(seed-team-aliases.mjs)를 먼저 보강한 뒤, 이미 수집된 기존 미분류
 *       행들에 새 로직을 재적용해 백필한다.
 *       "교육생 등록카드"류(약 32건)는 5개 서류유형 어디에도 속하지 않아 사용자 확인 하에
 *       분류 대신 삭제한다.
 *
 * 안전장치:
 *   - team_id가 이미 있는 행은 팀을 재배정하지 않음(doc_type만 재시도) — 오분류 위험 방지.
 *   - 파일명 우선 매칭(saveDoc과 동일 원칙) → 실패 시 전체 classifyTeam() 순.
 *   - 등록카드 삭제는 Drive 휴지통 이동(best-effort) + DB 삭제, bulk-delete API와 동일 패턴.
 *
 * 실행: npx tsx scripts/reclassify-unclassified-documents.mjs [--dry-run]
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

function fixSA() {
  const v = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  try { JSON.parse(v); return; } catch { /* repair */ }
  let out = "", inStr = false, prev = "";
  for (const ch of v) {
    if (ch === '"' && prev !== "\\") { inStr = !inStr; out += ch; prev = ch; continue; }
    const code = ch.charCodeAt(0);
    out += (inStr && code < 0x20)
      ? (ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : "\\u" + code.toString(16).padStart(4, "0"))
      : ch;
    prev = ch;
  }
  try { JSON.parse(out); process.env.GOOGLE_SERVICE_ACCOUNT_JSON = out; } catch {}
}
fixSA();

const DRY = process.argv.includes("--dry-run");

const { createClient } = await import("@libsql/client");
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const { classifyTeam, classifyTeamByText, classifyDocType, resetClassifierCache } = await import("../src/lib/integrations/classifier.ts");
const { deleteDriveFile } = await import("../src/lib/integrations/drive.ts");

// 실제 코디들이 쓰는 반 이름/지역명 — 정식 팀명에 없어 자동분류가 실패하던 것들
const ENSURE_ALIASES = {
  25: ["완주반"],
  24: ["낙안반"],
  29: ["인제"],
  30: ["청주", "오창"],
};
// 별칭 삽입은 멱등(INSERT OR IGNORE)하고 그 자체로는 부작용이 없어(문서 삭제/수정과 달리)
// dry-run 여부와 무관하게 항상 실행 — 그래야 dry-run 시뮬레이션이 실제 결과와 일치함.
for (const [tid, list] of Object.entries(ENSURE_ALIASES)) {
  for (const alias of list) {
    try { await c.execute({ sql: "INSERT OR IGNORE INTO team_aliases (team_id, alias) VALUES (?, ?)", args: [Number(tid), alias] }); } catch (e) { console.error(`  ! alias ${alias}(team ${tid}): ${e.message}`); }
  }
}
resetClassifierCache();

const REGISTRATION_CARD = /등록\s*카드/;

const docs = (await c.execute("SELECT id, team_id, doc_type, file_name, email_subject, email_from, file_path FROM documents WHERE doc_type='미분류'")).rows;

let deleted = 0, teamResolved = 0, docTypeResolved = 0, untouched = 0;

console.log(`${DRY ? "[dry-run] " : ""}미분류 ${docs.length}건 처리 시작`);

for (const d of docs) {
  const subject = d.email_subject ?? "";
  const fileName = d.file_name ?? "";

  if (REGISTRATION_CARD.test(fileName) || REGISTRATION_CARD.test(subject)) {
    console.log(`삭제: [${d.id}] ${fileName}`);
    if (!DRY) {
      if (d.file_path) { try { await deleteDriveFile(d.file_path); } catch {} }
      await c.execute({ sql: "DELETE FROM documents WHERE id=?", args: [d.id] });
    }
    deleted++;
    continue;
  }

  let teamId = d.team_id;
  if (!teamId) {
    teamId = (await classifyTeamByText(fileName)) ?? (await classifyTeam({ fromAddress: d.email_from ?? "", subject, fileName }));
    if (teamId) {
      teamResolved++;
      console.log(`팀 배정: [${d.id}] team=${teamId} | ${subject} | ${fileName}`);
      if (!DRY) await c.execute({ sql: "UPDATE documents SET team_id=? WHERE id=?", args: [teamId, d.id] });
    }
  }

  if (teamId) {
    const docType = classifyDocType(subject, fileName);
    if (docType !== "미분류") {
      docTypeResolved++;
      console.log(`유형 배정: [${d.id}] ${docType} | ${subject} | ${fileName}`);
      if (!DRY) await c.execute({ sql: "UPDATE documents SET doc_type=? WHERE id=?", args: [docType, d.id] });
      continue;
    }
  }
  if (!teamId) untouched++;
}

console.log();
console.log(`${DRY ? "[dry-run] " : ""}완료 — 총 ${docs.length}건`);
console.log(`  삭제(등록카드): ${deleted}`);
console.log(`  팀 신규 배정: ${teamResolved}`);
console.log(`  유형까지 해결(미분류 배지에서 제거): ${docTypeResolved}`);
console.log(`  여전히 미분류(수동 처리 필요): ${docs.length - deleted - docTypeResolved}`);
