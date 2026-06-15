/**
 * 팀별 정산(expenses) 정리 — 메일 ZIP/HWP 묶음의 영수증을 올바른 팀으로 등록/이동 (일회성).
 *
 * 배경: 코디가 ZIP 으로 묶어 보낸 영수증 중,
 *   (1) "결과보고.zip" 처럼 컨테이너명이 영수증 키워드가 아니면 기존 수집이 영수증을 건너뜀
 *       → 산청청년(team17) 식비/간식 등 정산 누락.
 *   (2) 겸임 코디 메일이 한 팀으로 분류돼, 다른 팀 ZIP("감귤국 품의서")의 영수증이 엉뚱한 팀에 등록됨.
 *
 * 이 스크립트(2026-02-01 이후 메일만):
 *   Phase 1 (reconcile): mail expenses 중 attachment_name 의 컨테이너명이 확정 팀과 다르면 그 팀으로 이동.
 *   Phase 2 (backfill):  ZIP/HWP 영수증을 컨테이너명 기준 팀으로 OCR·등록(중복은 자동 스킵).
 *
 * 팀 분류는 "텍스트(컨테이너 파일명→제목) 별칭"만 사용. 확정 안 되면 건드리지 않음.
 *
 * 실행: npx tsx scripts/backfill-zip-expenses.mjs [--dry-run]
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
const CUTOFF_DATE = "2026/02/01";
const CUTOFF_ISO = "2026-02-01T00:00:00.000Z";

const { createClient } = await import("@libsql/client");
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const { getGmailClient } = await import("../src/lib/integrations/google-auth.ts");
const { classifyTeamByText, resetClassifierCache } = await import("../src/lib/integrations/classifier.ts");
const { extractEmbeddedImages, extractHwpImages, expandPdfCandidates, processReceiptCandidate, detectSessionNo: detectReceiptSession } = await import("../src/lib/integrations/imap-receipts.ts");
resetClassifierCache();

const teams = (await c.execute("SELECT id, name FROM teams")).rows.map((r) => ({ id: Number(r.id), name: r.name }));
const teamName = (id) => teams.find((t) => t.id === Number(id))?.name ?? null;
const containerOf = (att) => String(att || "").split("::")[0];

// ───────────── Phase 1: 오배치 정산 이동 ─────────────
console.log("=== Phase 1: 오배치 정산(expenses) 팀 이동 ===");
const mailExp = (await c.execute("SELECT id, team_id, category, spent_date, total_amount, attachment_name FROM expenses WHERE source='mail' AND attachment_name IS NOT NULL")).rows;
let moved = 0;
for (const e of mailExp) {
  const cont = containerOf(e.attachment_name);
  const t2 = await classifyTeamByText(cont);
  if (!t2 || Number(t2) === Number(e.team_id)) continue;
  console.log(`  ${DRY ? "(dry) " : ""}이동 id=${e.id} ${e.category}/${e.spent_date}/${e.total_amount}원 : team ${e.team_id}(${teamName(e.team_id)}) → ${t2}(${teamName(t2)})  [${cont}]`);
  if (!DRY) {
    // 새 팀의 spent_date 최근접 회차로 session_no 재배정(없으면 null)
    const sess = (await c.execute({ sql: "SELECT session_no, scheduled_date FROM sessions WHERE team_id=?", args: [t2] })).rows;
    let best = null;
    for (const s of sess) {
      const diff = Math.abs(new Date(s.scheduled_date).getTime() - new Date(e.spent_date).getTime()) / 86400000;
      if (best === null || diff < best.diff) best = { no: s.session_no, diff };
    }
    const newSession = best && best.diff <= 31 ? best.no : null;
    await c.execute({ sql: "UPDATE expenses SET team_id=?, session_id=NULL, session_no=? WHERE id=?", args: [t2, newSession, e.id] });
  }
  moved++;
}
console.log(`  이동 ${moved}건`);

// ───────────── Phase 2: 누락 영수증 backfill ─────────────
console.log("\n=== Phase 2: ZIP/HWP 영수증 정산 backfill ===");
const gmail = getGmailClient();
if (!gmail) { console.error("Gmail client 없음"); process.exit(1); }
const userId = process.env.GMAIL_USER;

// allowlist
const allow = new Set();
for (const r of (await c.execute("SELECT coordinator_email c, professor_email p FROM teams")).rows) { if (r.c) allow.add(String(r.c).toLowerCase()); if (r.p) allow.add(String(r.p).toLowerCase()); }
for (const r of (await c.execute("SELECT email FROM users")).rows) if (r.email) allow.add(String(r.email).toLowerCase());

function extractAddr(from) { const m = (from || "").match(/<([^>]+)>/); return (m ? m[1] : from || "").trim().toLowerCase(); }
function* walk(p) { if (!p) return; yield p; if (p.parts) for (const x of p.parts) yield* walk(x); }
function fileExt(n) { const i = n.lastIndexOf("."); return i < 0 ? "" : n.slice(i).toLowerCase(); }

let pageToken, refs = [];
do {
  const res = await gmail.users.messages.list({ userId, q: `has:attachment after:${CUTOFF_DATE}`, maxResults: 100, pageToken });
  for (const m of (res.data.messages ?? [])) refs.push(m);
  pageToken = res.data.nextPageToken;
} while (pageToken && refs.length < 1000);
console.log(`  첨부 메일 ${refs.length}건 스캔 (${CUTOFF_DATE} 이후)`);

const perTeam = {};
let created = 0, dup = 0, skipped = 0, wouldCreate = 0, noTeam = 0;

for (const ref of refs) {
  const full = await gmail.users.messages.get({ userId, id: ref.id, format: "full" });
  const hs = full.data.payload?.headers ?? [];
  const subject = hs.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
  const fromAddress = extractAddr(hs.find((h) => h.name.toLowerCase() === "from")?.value);
  if (allow.size && !allow.has(fromAddress)) continue;
  const receivedAt = full.data.internalDate ? new Date(Number(full.data.internalDate)).toISOString() : new Date().toISOString();
  if (receivedAt < CUTOFF_ISO) continue;
  const messageId = hs.find((h) => h.name.toLowerCase() === "message-id")?.value || `gmail-${ref.id}`;
  const subjectSession = detectReceiptSession(subject);

  for (const part of walk(full.data.payload)) {
    const fn = part.filename || "";
    const ext = fileExt(fn);
    if (![".zip", ".hwpx", ".hwp"].includes(ext)) continue;
    if (!part.body?.attachmentId) continue;

    // 컨테이너명(또는 제목)으로 팀 확정
    const teamId = (await classifyTeamByText(fn)) ?? (await classifyTeamByText(subject));
    if (!teamId) { noTeam++; continue; }

    const att = await gmail.users.messages.attachments.get({ userId, messageId: ref.id, id: part.body.attachmentId });
    if (!att.data.data) continue;
    const buf = Buffer.from(att.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    let cands = (ext === ".hwp") ? extractHwpImages(buf, fn) : extractEmbeddedImages(buf, fn);
    cands = await expandPdfCandidates(cands.map((x) => ({ name: x.name, buf: x.buf, mime: x.mime })));
    if (!cands.length) continue;

    for (const cand of cands) {
      if (DRY) {
        const ex = await c.execute({ sql: "SELECT id FROM expenses WHERE mail_message_id=? AND attachment_name=? LIMIT 1", args: [messageId, cand.name] });
        if (ex.rows.length) { dup++; continue; }
        const label = teamName(teamId);
        perTeam[label] = (perTeam[label] ?? 0) + 1; wouldCreate++;
        if (wouldCreate <= 60) console.log(`  (dry) + [${label}] ${cand.name}`);
        continue;
      }
      const outcome = await processReceiptCandidate(cand, { teamId, fromAddr: fromAddress, subject, messageId, receivedAt, subjectSession, teams });
      if (outcome.status === "created") { created++; const label = teamName(teamId); perTeam[label] = (perTeam[label] ?? 0) + 1; console.log(`  + [${label}] ${cand.name} → ${outcome.detail}`); }
      else if (outcome.status === "duplicate") dup++;
      else skipped++;
    }
  }
}

console.log(`\n=== 완료 ${DRY ? "(DRY-RUN)" : ""} ===`);
if (DRY) console.log(`이동대상 ${moved}건 · 신규등록예정 ${wouldCreate}건 · 기존중복 ${dup}건 · 팀미확정 ${noTeam}`);
else console.log(`이동 ${moved}건 · 신규등록 ${created}건 · 중복스킵 ${dup}건 · 영수증아님스킵 ${skipped}건 · 팀미확정 ${noTeam}`);
console.log("팀별 신규:", JSON.stringify(perTeam, null, 2));
process.exit(0);
