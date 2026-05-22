import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const uids = await client.search({ since, from: "37210114ok@gmail.com" }, { uid: true });
  console.log(`찾은 메일 ${uids.length}건`);

  for (const uid of uids) {
    const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    const date = parsed.date?.toISOString().slice(0, 10);
    const atts = parsed.attachments.map(a => `${a.filename}(${a.contentType},${a.size}B)`).join(", ") || "첨부없음";
    console.log(`[${date}] ${parsed.subject?.slice(0, 50)} → ${atts}`);
  }
} finally {
  lock.release();
  await client.logout();
}
