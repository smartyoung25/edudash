import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const TARGETS = [
  { team: "딸기15 논산 (18)", email: "kak15022@naver.com" },
  { team: "딸기12 진주 (21)", email: "namkeeyeul@gmail.com" },
  { team: "한우7기 (29)", email: "purelea@iiam.co.kr" },
  { team: "한우6기 청주 (30)", email: "purelea@iiam.co.kr" },
];

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});
await client.connect();
const lock = await client.getMailboxLock("INBOX");
const seen = new Set();
try {
  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000);
  for (const t of TARGETS) {
    if (seen.has(t.email)) { console.log(`\n## ${t.team} → ${t.email} (위와 동일 발신자)`); continue; }
    seen.add(t.email);
    console.log(`\n## ${t.team} — from:${t.email} (since ${since.toISOString().slice(0,10)})`);
    const uids = await client.search({ since, from: t.email }, { uid: true });
    console.log(`  검색결과: ${uids?.length || 0}건`);
    const slice = (uids || []).slice(-10);
    for (const uid of slice) {
      try {
        const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
        if (!msg?.source) continue;
        const p = await simpleParser(msg.source);
        const from = p.from?.value?.[0]?.address ?? "-";
        const date = p.date?.toISOString().slice(0,10);
        const atts = p.attachments.map(a => `${a.filename}(${(a.size/1024).toFixed(0)}kb)`).join(", ") || "(없음)";
        console.log(`  [${date}] from=${from} | ${(p.subject||"").slice(0,60)}`);
        console.log(`     첨부: ${atts}`);
      } catch (e) { console.log(`  uid ${uid}: ${e.message}`); }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
