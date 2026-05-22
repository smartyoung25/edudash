import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});
await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
  const uids = await client.search({ since, from: "purelea@iiam.co.kr" }, { uid: true });
  for (const uid of uids || []) {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    const date = parsed.date?.toISOString().slice(0, 10);
    if (!parsed.subject?.includes("보고서") && !parsed.subject?.includes("정산")) continue;
    console.log(`\n=== [${date}] ${parsed.subject} ===`);
    console.log("첨부:", parsed.attachments.map(a => a.filename).join(", ") || "(없음)");
    console.log("본문 (앞 1000자):");
    console.log((parsed.text || "").slice(0, 1000));
  }
} finally {
  lock.release();
  await client.logout();
}
