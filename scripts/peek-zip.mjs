// 김성태 메일의 ZIP 첨부 안에 뭐가 있는지 살펴보기
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import AdmZip from "adm-zip";

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const uids = await client.search({ since, from: "37210114ok@gmail.com" }, { uid: true });

  for (const uid of uids) {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    const date = parsed.date?.toISOString().slice(0, 10);
    console.log(`\n[${date}] ${parsed.subject?.slice(0, 60)}`);
    for (const att of parsed.attachments) {
      if (!att.filename?.toLowerCase().endsWith(".zip")) continue;
      try {
        const zip = new AdmZip(att.content);
        for (const e of zip.getEntries()) {
          if (e.isDirectory) continue;
          console.log(`  - ${e.entryName} (${e.header.size}B)`);
        }
      } catch (e) {
        console.log(`  ZIP 오류: ${e.message}`);
      }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
