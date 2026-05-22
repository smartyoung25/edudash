// 이종민 HWP 한 개 저장
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});
await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000);
  const uids = await client.search({ since, from: "teenglish@naver.com" }, { uid: true });
  for (const uid of uids || []) {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    for (const att of parsed.attachments) {
      if (att.filename === "경비품의서(1차).hwp") {
        fs.writeFileSync("tmp_kim_attachments/lee_hwp.hwp", att.content);
        console.log("saved:", att.size, "bytes");
        process.exit(0);
      }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
