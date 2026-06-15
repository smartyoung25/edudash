/**
 * 딸기16기(team 17, "딸기16산청청년") 서류 복구 (일회성).
 *
 * 원인: 코디(37210114ok@gmail.com)가 서류를 ZIP 으로 묶어 보내는데, 기존 수집 로직은
 *       ZIP 내부에서 "영수증"만 추출하고 출석부·코디일지 등 "문서"는 documents 행으로
 *       저장하지 않았다. 또한 겸임 코디 + 별칭 충돌("딸기육묘팀")로 team 16 으로 오분류됐다.
 *
 * 이 스크립트:
 *   1) 향후 자동 분류 교정을 위해 team 17 별칭 추가("산청청년딸기육묘팀","산청딸기").
 *   2) 6/12 "산청청년딸기육묘팀" 메일의 산청딸기 ZIP 에서 문서를 추출해 team 17 documents 로 등록.
 *      (영수증/정산은 건드리지 않음 — 서류 복구에만 집중)
 *
 * 실행: npx tsx scripts/recover-team17-docs.mjs [--dry-run]
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

// SA JSON: vercel pull 이 private_key 안에 실제 제어문자(개행)를 넣어 JSON.parse 실패.
// 문자열 "내부" 제어문자만 이스케이프해 유효 JSON 으로 복원.
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
const TARGET_TEAM = 17;
const TARGET_NAME = "딸기16산청청년";

const { createClient } = await import("@libsql/client");
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// 1) team 17 별칭 추가(향후 자동 라우팅 교정)
const NEW_ALIASES = ["산청청년딸기육묘팀", "산청딸기"];
console.log("=== 1) team 17 별칭 추가 ===");
for (const a of NEW_ALIASES) {
  if (DRY) { console.log(`  (dry) + ${a}`); continue; }
  try { await c.execute({ sql: "INSERT OR IGNORE INTO team_aliases (team_id, alias) VALUES (?, ?)", args: [TARGET_TEAM, a] }); console.log(`  + ${a}`); }
  catch (e) { console.log(`  ! ${a}: ${String(e).slice(0, 60)}`); }
}

// 2) 6/12 메일의 산청딸기 ZIP → 문서 추출 → team 17 등록
const { getGmailClient } = await import("../src/lib/integrations/google-auth.ts");
const { extractEmbeddedDocuments } = await import("../src/lib/integrations/imap-receipts.ts");
const { classifyDocType, detectMonth, detectSessionNo } = await import("../src/lib/integrations/classifier.ts");
const { uploadDocumentToDrive } = await import("../src/lib/integrations/drive.ts");

const gmail = getGmailClient();
if (!gmail) { console.error("Gmail client 없음 — 자격증명 확인"); process.exit(1); }
const userId = process.env.GMAIL_USER;

function* walk(p) { if (!p) return; yield p; if (p.parts) for (const x of p.parts) yield* walk(x); }

const list = await gmail.users.messages.list({ userId, q: "from:37210114ok@gmail.com subject:산청청년딸기육묘팀 has:attachment", maxResults: 5 });
const msgs = list.data.messages ?? [];
console.log(`\n=== 2) 대상 메일 ${msgs.length}건 처리 ===`);

let created = 0, skipped = 0;
for (const ref of msgs) {
  const full = await gmail.users.messages.get({ userId, id: ref.id, format: "full" });
  const hs = full.data.payload?.headers ?? [];
  const subject = hs.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
  const receivedAt = full.data.internalDate ? new Date(Number(full.data.internalDate)).toISOString() : new Date().toISOString();

  for (const part of walk(full.data.payload)) {
    const fn = part.filename || "";
    if (!fn.toLowerCase().endsWith(".zip") || !fn.includes("산청")) continue; // 산청딸기 ZIP 만 (감귤국 ZIP 제외)
    const att = await gmail.users.messages.attachments.get({ userId, messageId: ref.id, id: part.body.attachmentId });
    const buf = Buffer.from(att.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const docs = extractEmbeddedDocuments(buf, fn);
    console.log(`\n  ZIP "${fn}" → 문서 ${docs.length}건`);

    for (const d of docs) {
      const docType = classifyDocType(subject, d.name);
      const month = detectMonth(subject, receivedAt, "", d.name);
      const sessionNo = await detectSessionNo({ teamId: TARGET_TEAM, subject, body: "", fileName: d.name, receivedAt });
      // 중복: 같은 팀 + 파일명
      const dup = await c.execute({ sql: "SELECT id FROM documents WHERE team_id=? AND file_name=? LIMIT 1", args: [TARGET_TEAM, d.name] });
      if (dup.rows.length) { console.log(`    = 중복스킵 ${d.name}`); skipped++; continue; }
      console.log(`    + ${d.name}  → ${docType}/${month ?? "-"}월/${sessionNo ?? "-"}회차`);
      if (DRY) { created++; continue; }
      const up = await uploadDocumentToDrive({ teamName: TARGET_NAME, docType, month, fileName: d.name, bytes: d.buf });
      if (!up.ok) { console.log(`    ! 업로드 실패: ${up.message}`); continue; }
      await c.execute({
        sql: `INSERT INTO documents (team_id, doc_type, month, session_no, file_name, file_path, source, status, received_at, email_from, email_subject)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [TARGET_TEAM, docType, month, sessionNo, d.name, up.webViewLink ?? up.fileId ?? "", "mail", "submitted", receivedAt, "37210114ok@gmail.com", subject],
      });
      created++;
    }
  }
}

const cnt = (await c.execute({ sql: "SELECT COUNT(*) n FROM documents WHERE team_id=?", args: [TARGET_TEAM] })).rows[0].n;
console.log(`\n=== 완료 ${DRY ? "(DRY-RUN)" : ""} ===`);
console.log(`생성 ${created}건, 중복스킵 ${skipped}건 · team ${TARGET_TEAM} 현재 문서 ${cnt}건`);
process.exit(0);
