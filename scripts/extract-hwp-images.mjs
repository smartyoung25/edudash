// HWP/HWPX 안에 임베드된 이미지(영수증) 추출 시도
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

const OUT_DIR = "tmp_kim_attachments";
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

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
    const slug = (parsed.subject || `m${uid}`).replace(/[^\w가-힣]/g, "_").slice(0, 40);

    for (const att of parsed.attachments) {
      if (!att.filename) continue;
      // ZIP → 안의 HWP/HWPX 추출
      if (att.filename.toLowerCase().endsWith(".zip")) {
        const zip = new AdmZip(att.content);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const lower = entry.entryName.toLowerCase();
          // 경비/지출/품의서 관련 HWP/HWPX 만 분석
          if (!(lower.endsWith(".hwp") || lower.endsWith(".hwpx"))) continue;
          if (!/경비|지출|품의|영수|식대|식비|재료|출장/.test(entry.entryName)) continue;

          const buf = entry.getData();
          const subDir = path.join(OUT_DIR, `${date}_${slug}`);
          if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });

          console.log(`\n[${date}] ${entry.entryName}`);

          // HWPX는 ZIP 형식 → 다시 풀기
          if (lower.endsWith(".hwpx")) {
            try {
              const innerZip = new AdmZip(buf);
              for (const inner of innerZip.getEntries()) {
                if (inner.isDirectory) continue;
                if (/\.(png|jpg|jpeg|gif|bmp)$/i.test(inner.entryName)) {
                  const out = path.join(subDir, path.basename(inner.entryName));
                  fs.writeFileSync(out, inner.getData());
                  console.log(`  +이미지: ${out} (${inner.header.size}B)`);
                }
              }
            } catch (e) {
              console.log(`  HWPX 풀기 실패: ${e.message}`);
            }
          } else {
            // HWP (OLE 형식) — BinData 스트림에 이미지가 들어있음. 일단 raw로 저장
            const hwpOut = path.join(subDir, path.basename(entry.entryName));
            fs.writeFileSync(hwpOut, buf);
            console.log(`  HWP 저장(별도 추출 필요): ${hwpOut}`);
          }
        }
      }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
console.log(`\n출력: ${OUT_DIR}`);
