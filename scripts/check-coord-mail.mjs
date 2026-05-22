import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const target = process.argv[2] || "teenglish@naver.com";
const days = Number(process.argv[3] || 120);

const client = new ImapFlow({
  host: process.env.IMAP_HOST, port: 993, secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
  logger: false,
});
await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  // 다양한 방식으로 검색
  console.log(`검색 1: from: ${target} (since ${since.toISOString().slice(0, 10)})`);
  const uids1 = await client.search({ since, from: target }, { uid: true });
  console.log(`  → ${uids1?.length || 0}건`);

  console.log(`\n검색 2: 단순 from = ${target} (전체 기간)`);
  const uids2 = await client.search({ from: target }, { uid: true });
  console.log(`  → ${uids2?.length || 0}건`);

  console.log(`\n검색 3: 이종민 본문 검색`);
  const uids3 = await client.search({ since, body: "이종민" }, { uid: true });
  console.log(`  → ${uids3?.length || 0}건`);

  const allUids = [...new Set([...(uids1||[]), ...(uids2||[]), ...(uids3||[])])].slice(0, 30);
  console.log(`\n=== 발견된 메일 상세 (최대 30개) ===`);
  for (const uid of allUids) {
    const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    const fromAddr = parsed.from?.value?.[0]?.address ?? "-";
    const date = parsed.date?.toISOString().slice(0, 10);
    const atts = parsed.attachments.map(a => `${a.filename}(${a.contentType})`).join(", ") || "(첨부없음)";
    console.log(`[${date}] from:${fromAddr} | ${parsed.subject?.slice(0, 50)}`);
    console.log(`    첨부: ${atts}`);
  }
} finally {
  lock.release();
  await client.logout();
}
