// 이미 등록된 메일 영수증의 원본 이미지를 다시 받아서 디스크에 저장
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import AdmZip from "adm-zip";
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

const RECEIPTS_DIR = "data/receipts";
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function pickExt(name) {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g|bmp)(?=::|$)/);
  return m ? `.${m[1]}` : ".bin";
}
function guessMime(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.match(/\.jpe?g/)) return "image/jpeg";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

function findImage(zipBuf, innerPath) {
  // innerPath 예: "감귤국 3월 보고서.zip::감귤국팀출장비 품의서_3월.hwpx::BinData/image1.bmp"
  const parts = innerPath.split("::");
  if (parts.length < 2) return null;
  let currentBuf = zipBuf;
  // 첫 부분은 메일 첨부 자체 ZIP 이름 — 이미 currentBuf 가 그 ZIP
  for (let i = 1; i < parts.length; i++) {
    const target = parts[i];
    try {
      const zip = new AdmZip(currentBuf);
      const entry = zip.getEntries().find(e => e.entryName === target);
      if (!entry) return null;
      if (i === parts.length - 1) return entry.getData();
      currentBuf = entry.getData();
    } catch (e) {
      return null;
    }
  }
  return null;
}

const c = createClient({ url: "file:./data/app.db" });
const rows = (await c.execute("SELECT id, team_id, mail_message_id, mail_from, attachment_name FROM expenses WHERE source='mail' AND receipt_file_path IS NULL")).rows;
console.log(`대상 ${rows.length}건`);

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});
await client.connect();
const lock = await client.getMailboxLock("INBOX");
let filled = 0;
try {
  // mail_message_id별로 그룹핑
  const byMsg = new Map();
  for (const r of rows) {
    if (!byMsg.has(r.mail_message_id)) byMsg.set(r.mail_message_id, []);
    byMsg.get(r.mail_message_id).push(r);
  }
  for (const [msgId, items] of byMsg.entries()) {
    // 메시지 검색 (HEADER Message-ID)
    const cleanId = msgId.replace(/^<|>$/g, "");
    const uids = await client.search({ header: { "Message-ID": cleanId } }, { uid: true });
    if (!uids || uids.length === 0) { console.log("못 찾음:", msgId); continue; }

    const msg = await client.fetchOne(String(uids[0]), { source: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);

    for (const item of items) {
      const attName = item.attachment_name;
      const parts = attName.split("::");
      const zipName = parts[0];
      const att = parsed.attachments.find(a => a.filename === zipName);
      if (!att) { console.log("첨부 못찾음:", attName); continue; }
      const buf = findImage(att.content, attName);
      if (!buf) { console.log("이미지 못찾음:", attName); continue; }

      ensureDir(path.join(RECEIPTS_DIR, String(item.team_id)));
      const ext = pickExt(attName);
      const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const rel = path.join(RECEIPTS_DIR, String(item.team_id), fname).replace(/\\/g, "/");
      fs.writeFileSync(rel, buf);
      await c.execute({
        sql: "UPDATE expenses SET receipt_file_path=?, receipt_mime_type=? WHERE id=?",
        args: [rel, guessMime(attName), item.id],
      });
      filled++;
      console.log(`id ${item.id}: ${rel}`);
    }
  }
} finally {
  lock.release();
  await client.logout();
}
console.log(`\n완료: ${filled}/${rows.length}`);
