/**
 * 과거 메일의 ZIP/HWPX 묶음 서류 일괄 복구 (일회성, 모든 팀).
 *
 * 배경: 코디들이 서류(출석부·코디일지·교육생일지·품의서 등)를 ZIP 으로 묶어 보내는데,
 *       기존 수집 로직은 ZIP 내부에서 "영수증"만 추출하고 "문서"는 documents 행으로
 *       저장하지 않았다. 코드는 수정됐고(extractEmbeddedDocuments), 이 스크립트는
 *       이미 도착해 mail_log 에 "처리됨"으로 남아 다시 수집되지 않는 과거 ZIP 메일들에서
 *       문서를 추출해 documents 로 backfill 한다.
 *
 * 안전장치:
 *   - 문서만 처리(영수증/정산 expenses 는 건드리지 않음).
 *   - 멱등: 같은 (팀, 파일명) 문서가 이미 있으면 스킵.
 *   - 발신자 allowlist(코디/교수/사용자 이메일) 외 메일은 무시.
 *   - 팀 분류: 파일명 별칭 → 메일 단위(classifyTeam) → 그래도 모르면 미분류(team_id=null).
 *
 * 실행: npx tsx scripts/backfill-zip-documents.mjs [--dry-run] [days=240]
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
// 대상 기간: 2026-02-01 이후 메일만 (이전 연도의 다른 프로그램 자료 제외)
const CUTOFF_DATE = "2026/02/01";           // Gmail after: 쿼리용
const CUTOFF_ISO = "2026-02-01T00:00:00.000Z"; // 코드측 가드용

const { createClient } = await import("@libsql/client");
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const { getGmailClient } = await import("../src/lib/integrations/google-auth.ts");
const { extractEmbeddedDocuments } = await import("../src/lib/integrations/imap-receipts.ts");
const { classifyTeamByText, classifyDocType, detectMonth, detectSessionNo, resetClassifierCache } = await import("../src/lib/integrations/classifier.ts");
const { uploadDocumentToDrive } = await import("../src/lib/integrations/drive.ts");
const { EXTRA_COORDINATOR_EMAILS } = await import("../src/lib/integrations/coordinator-overrides.ts");

// 정확 라우팅을 위한 별칭 보강(언급된 팀: 밀양 딸기17육묘=team16). 감귤국·산청청년은 이미 보강됨.
const ENSURE_ALIASES = { 16: ["밀양딸기", "밀양딸기팀", "밀양딸기육묘팀", "밀양육묘"] };
for (const [tid, list] of Object.entries(ENSURE_ALIASES)) {
  for (const a of list) {
    try { await c.execute({ sql: "INSERT OR IGNORE INTO team_aliases (team_id, alias) VALUES (?, ?)", args: [Number(tid), a] }); } catch {}
  }
}
// 과도하게 일반적인 별칭 제거 — "성장농"은 사업(프로그램) 이름이라 무관 메일이 감귤6(team26)로 오분류됨.
// (팀 고유 별칭 "감귤성장농","감귤6" 등은 유지)
const REMOVE_ALIASES = ["성장농"];
for (const a of REMOVE_ALIASES) {
  try { await c.execute({ sql: "DELETE FROM team_aliases WHERE alias=?", args: [a] }); } catch {}
}
resetClassifierCache();

// 팀 id→name
const teams = (await c.execute("SELECT id, name FROM teams")).rows;
const teamName = (id) => (id == null ? null : teams.find((t) => Number(t.id) === Number(id))?.name ?? null);

// allowlist (코디/교수/사용자 + 코드보강)
const allow = new Set();
for (const r of (await c.execute("SELECT coordinator_email c, professor_email p FROM teams")).rows) {
  if (r.c) allow.add(String(r.c).toLowerCase());
  if (r.p) allow.add(String(r.p).toLowerCase());
}
for (const r of (await c.execute("SELECT email FROM users")).rows) if (r.email) allow.add(String(r.email).toLowerCase());
for (const e of (EXTRA_COORDINATOR_EMAILS || [])) allow.add(String(e).toLowerCase());

const gmail = getGmailClient();
if (!gmail) { console.error("Gmail client 없음"); process.exit(1); }
const userId = process.env.GMAIL_USER;

function extractAddr(from) { const m = (from || "").match(/<([^>]+)>/); return (m ? m[1] : from || "").trim().toLowerCase(); }
function* walk(p) { if (!p) return; yield p; if (p.parts) for (const x of p.parts) yield* walk(x); }
function fileExt(n) { const i = n.lastIndexOf("."); return i < 0 ? "" : n.slice(i).toLowerCase(); }

// Gmail 메시지 목록(페이지네이션) — 2026-02-01 이후 첨부 메일만
const q = `has:attachment after:${CUTOFF_DATE}`;
let pageToken = undefined, refs = [];
do {
  const res = await gmail.users.messages.list({ userId, q, maxResults: 100, pageToken });
  for (const m of (res.data.messages ?? [])) refs.push(m);
  pageToken = res.data.nextPageToken;
} while (pageToken && refs.length < 1000);
console.log(`첨부 메일 ${refs.length}건 스캔 (${CUTOFF_DATE} 이후)${DRY ? " · DRY-RUN" : ""}\n`);

const perTeam = {}; // teamName → created count
let created = 0, skipped = 0, scannedZips = 0, skippedSender = 0, skippedNoTeam = 0, skippedUntyped = 0, skippedOld = 0;

for (const ref of refs) {
  const full = await gmail.users.messages.get({ userId, id: ref.id, format: "full" });
  const hs = full.data.payload?.headers ?? [];
  const subject = hs.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
  const fromAddress = extractAddr(hs.find((h) => h.name.toLowerCase() === "from")?.value);
  if (allow.size && !allow.has(fromAddress)) { skippedSender++; continue; }
  const receivedAt = full.data.internalDate ? new Date(Number(full.data.internalDate)).toISOString() : new Date().toISOString();
  if (receivedAt < CUTOFF_ISO) { skippedOld++; continue; } // 2026-02-01 이전 메일 제외

  // 이 메일의 ZIP/HWPX 컨테이너에서 문서 추출
  const containers = [];
  for (const part of walk(full.data.payload)) {
    const fn = part.filename || "";
    const ext = fileExt(fn);
    if (ext !== ".zip" && ext !== ".hwpx") continue;
    if (!part.body?.attachmentId) continue;
    const att = await gmail.users.messages.attachments.get({ userId, messageId: ref.id, id: part.body.attachmentId });
    if (!att.data.data) continue;
    const buf = Buffer.from(att.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (ext === ".zip") {
      const docs = extractEmbeddedDocuments(buf, fn);
      if (docs.length) { scannedZips++; containers.push(...docs); }
    } else {
      // .hwpx 자체가 한 문서
      containers.push({ name: fn, buf });
    }
  }
  if (!containers.length) continue;

  for (const d of containers) {
    // 팀은 "텍스트(파일명→제목)"로만 확정. 발신자 이메일 폴백은 겸임/과거이력 오분류가 심해 사용하지 않음.
    // 팀이 확정되지 않으면(다른 프로그램·과거 메일 등) backfill 대상에서 제외.
    const teamId = (await classifyTeamByText(d.name)) ?? (await classifyTeamByText(subject));
    if (!teamId) { skippedNoTeam++; continue; }
    const tName = teamName(teamId);
    const docType = classifyDocType(subject, d.name);
    // 유형이 확정된 서류만 backfill — 미분류(OT계획서·신청서·보조금 등 무관문서) 오수집 방지.
    if (docType === "미분류") { skippedUntyped++; continue; }
    const month = detectMonth(subject, receivedAt, "", d.name);
    const sessionNo = await detectSessionNo({ teamId, subject, body: "", fileName: d.name, receivedAt });

    // 멱등: 같은 (팀, 파일명) — 미분류는 (발신자, 파일명)
    const dup = teamId
      ? await c.execute({ sql: "SELECT id FROM documents WHERE source='mail' AND file_name=? AND team_id=? LIMIT 1", args: [d.name, teamId] })
      : await c.execute({ sql: "SELECT id FROM documents WHERE source='mail' AND file_name=? AND team_id IS NULL AND email_from=? LIMIT 1", args: [d.name, fromAddress] });
    if (dup.rows.length) { skipped++; continue; }

    const label = tName ?? "(미분류)";
    if (DRY) {
      console.log(`  + [${label}] ${docType} · ${d.name}`);
      perTeam[label] = (perTeam[label] ?? 0) + 1; created++; continue;
    }
    const up = await uploadDocumentToDrive({ teamName: tName, docType, month, fileName: d.name, bytes: d.buf });
    if (!up.ok) { console.log(`  ! 업로드실패 ${d.name}: ${up.message}`); continue; }
    await c.execute({
      sql: `INSERT INTO documents (team_id, doc_type, month, session_no, file_name, file_path, source, status, received_at, email_from, email_subject)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [teamId, docType, month, sessionNo, d.name, up.webViewLink ?? up.fileId ?? "", "mail", "submitted", receivedAt, fromAddress, subject],
    });
    perTeam[label] = (perTeam[label] ?? 0) + 1; created++;
    console.log(`  + [${label}] ${docType} · ${d.name}`);
  }
}

console.log(`\n=== 완료 ${DRY ? "(DRY-RUN)" : ""} ===`);
console.log(`ZIP ${scannedZips}개에서 문서 추출 · 생성 ${created}건 · 중복스킵 ${skipped}건 · 팀미확정제외 ${skippedNoTeam}건 · 유형미상제외 ${skippedUntyped}건 · 기간외(2월이전)제외 ${skippedOld}건 · 발신자제외 ${skippedSender}건`);
console.log("팀별 생성:", JSON.stringify(perTeam, null, 2));
process.exit(0);
