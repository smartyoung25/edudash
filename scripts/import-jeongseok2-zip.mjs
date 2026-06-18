/**
 * 일회성: 네이트온으로 받은 "딸기의 정석2 팀(15기).zip" 내용을
 *         team18(딸기15 논산 = "딸기의 정석2") 서류로 import.
 *   - ZIP 내부 문서만 documents 행으로 저장(영수증 OCR/정산은 건드리지 않음).
 *   - 팀은 team18 로 강제(사용자 지정). docType 은 파일명 규칙으로 판정.
 *   - 멱등: 같은 (team18, 파일명) 문서가 이미 있으면 스킵.
 * 실행: npx tsx scripts/import-jeongseok2-zip.mjs [--apply]
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });
import { readFileSync, statSync } from "node:fs";

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

const APPLY = process.argv.includes("--apply");
const TEAM_ID = 18;
const TEAM_NAME = "딸기15 논산";
const SUBJECT = "딸기의 정석2 15기 서류";
const ZIP = String.raw`C:\Users\IIamHub2\Documents\네이트온 받은 파일\딸기의 정석2 팀(15기).zip`;

const { createClient } = await import("@libsql/client");
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const { extractEmbeddedDocuments } = await import("../src/lib/integrations/imap-receipts.ts");
const { detectMonth } = await import("../src/lib/integrations/classifier.ts");
const { uploadDocumentToDrive } = await import("../src/lib/integrations/drive.ts");

// 파일명에 "N회차/N차시/N차" 가 명시된 경우에만 회차 지정(첫 매칭).
// 명시 없는 월별·통합 문서는 null(수동 업로드와 동일) — 수신일 기준 오폴백 방지.
function explicitSession(name) {
  const m = name.match(/(\d+)\s*(?:회차|차시|차)/);
  return m ? Number(m[1]) : null;
}

// 이 ZIP 전용 docType 규칙(가장 구체적인 것부터). 파일명에 "교육일지"/"일지 통합" 등
// 분류기 키워드에 없는 변형이 많아 별도 판정한다.
function resolveDocType(name) {
  const s = name.toLowerCase();
  if (/출석부/.test(s)) return "출석부";
  if (/운영일지|코디/.test(s)) return "코디일지";
  if (/수당|강사/.test(s)) return "강사비지급확인서";
  if (/지출|결의서/.test(s)) return "경비영수증";
  if (/교육생일지|교육일지|학습일지|일지/.test(s)) return "교육생일지";
  return "미분류";
}

const buf = readFileSync(ZIP);
const receivedAt = statSync(ZIP).mtime.toISOString();
const docs = extractEmbeddedDocuments(buf, "딸기의 정석2 팀(15기).zip");
console.log(`ZIP에서 ${docs.length}건 추출 · 대상 team${TEAM_ID}(${TEAM_NAME})${APPLY ? "" : " · DRY-RUN"}\n`);

let created = 0, skipped = 0;
const byType = {};
for (const d of docs) {
  const docType = resolveDocType(d.name);
  const month = detectMonth(SUBJECT, receivedAt, "", d.name);
  const sessionNo = explicitSession(d.name);

  const dup = await c.execute({
    sql: "SELECT id FROM documents WHERE file_name=? AND team_id=? LIMIT 1",
    args: [d.name, TEAM_ID],
  });
  if (dup.rows.length) { console.log(`  = 중복스킵 [${docType}] ${d.name}`); skipped++; continue; }

  byType[docType] = (byType[docType] ?? 0) + 1;
  if (!APPLY) { console.log(`  + [${docType}] m=${month ?? "-"} s=${sessionNo ?? "-"} · ${d.name}`); created++; continue; }

  const up = await uploadDocumentToDrive({ teamName: TEAM_NAME, docType, month, fileName: d.name, bytes: d.buf });
  if (!up.ok) { console.log(`  ! 업로드실패 ${d.name}: ${up.message}`); continue; }
  await c.execute({
    sql: `INSERT INTO documents (team_id, doc_type, month, session_no, file_name, file_path, source, status, received_at, email_subject)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [TEAM_ID, docType, month, sessionNo, d.name, up.webViewLink ?? up.fileId ?? "", "manual", "submitted", receivedAt, SUBJECT],
  });
  console.log(`  + [${docType}] m=${month ?? "-"} s=${sessionNo ?? "-"} · ${d.name}`);
  created++;
}

console.log(`\n=== ${APPLY ? "완료" : "DRY-RUN"} === 생성 ${created} · 중복스킵 ${skipped}`);
console.log("유형분포:", JSON.stringify(byType));
process.exit(0);
