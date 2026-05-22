import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

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
  console.log(`이종민 메일 ${uids?.length || 0}건 (since ${since.toISOString().slice(0, 10)})`);

  for (const uid of uids || []) {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    const date = parsed.date?.toISOString().slice(0, 10);
    console.log(`\n[${date}] ${parsed.subject?.slice(0, 50)}`);
    for (const att of parsed.attachments) {
      const lower = (att.filename || "").toLowerCase();
      if (!lower.endsWith(".hwp")) continue;
      if (!/(경비|지출|품의|영수|식대|식비|재료|출장|결의)/.test(att.filename)) {
        console.log(`  스킵 (키워드 없음): ${att.filename}`);
        continue;
      }
      console.log(`  처리 시도: ${att.filename} (${att.size}B)`);
      // Python 호출
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hwp-"));
      const tmpFile = path.join(tmpDir, "input.hwp");
      fs.writeFileSync(tmpFile, att.content);
      try {
        const pythonPath = "C:/Users/IIamHub2/AppData/Local/Python/bin/python.exe";
        const out = execFileSync(pythonPath, ["scripts/extract_hwp_images.py", tmpFile, tmpDir], { encoding: "utf-8", timeout: 30000 });
        const r = JSON.parse(out);
        if (r.error) {
          console.log(`    Python 오류: ${r.error}`);
        } else {
          console.log(`    추출된 이미지: ${r.images.length}개`);
          for (const i of r.images.slice(0, 5)) console.log(`      - ${i.name} (${i.size}B)`);
        }
      } catch (e) {
        console.log(`    실행 실패: ${e.message}`);
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
