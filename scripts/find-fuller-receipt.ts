import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { createClient } from "@libsql/client";

// 대상: 밀양딸기육묘팀 2차(4월) 영수증 (신현구 1,050,000원)
async function main() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: 993, secure: true,
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASSWORD! },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  let allImages: { name: string; buf: Buffer; size: number }[] = [];

  try {
    const uids = await client.search({ from: "37210114ok@gmail.com" }, { uid: true });
    console.log("김성태 메일 총:", uids?.length);
    for (const uid of uids || []) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg?.source) continue;
      const parsed = await simpleParser(msg.source);
      if (!parsed.subject?.includes("밀양딸기육묘팀 2차")) continue;
      console.log(`\n[${parsed.date?.toISOString().slice(0, 10)}] ${parsed.subject}`);

      for (const att of parsed.attachments) {
        if (!att.filename) continue;
        const lower = att.filename.toLowerCase();
        console.log(`  ${att.filename}`);

        // ZIP → HWPX/HWP → 이미지
        if (lower.endsWith(".zip")) {
          const zip = new AdmZip(att.content);
          for (const e of zip.getEntries()) {
            if (e.isDirectory) continue;
            const innerLower = e.entryName.toLowerCase();
            // 강사비/경비/지출 관련 hwp/hwpx 모두 확인
            const isRelevant = /(경비|지출|품의|영수|식대|식비|재료|출장|결의|강사비)/.test(e.entryName);
            if (innerLower.endsWith(".hwpx") && isRelevant) {
              try {
                const innerZip = new AdmZip(e.getData());
                for (const i of innerZip.getEntries()) {
                  if (i.isDirectory) continue;
                  if (/^PrvImage/i.test(i.name)) continue;
                  if (/\.(png|jpe?g|bmp)$/i.test(i.entryName)) {
                    allImages.push({ name: `${att.filename}::${e.entryName}::${i.entryName}`, buf: i.getData(), size: i.header.size });
                  }
                }
              } catch {}
            } else if (innerLower.endsWith(".hwp") && isRelevant) {
              // HWP는 Python 호출
              const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "hwp-"));
              const tmpFile = path.join(tmpDir, "in.hwp");
              fs.writeFileSync(tmpFile, e.getData());
              try {
                const out = execFileSync("C:/Users/IIamHub2/AppData/Local/Python/bin/python.exe", ["scripts/extract_hwp_images.py", tmpFile, tmpDir], { encoding: "utf-8", timeout: 30000 });
                const r = JSON.parse(out);
                if (r.ok) {
                  for (const img of r.images) {
                    const buf = fs.readFileSync(img.path);
                    allImages.push({ name: `${att.filename}::${e.entryName}::${img.name}`, buf, size: buf.length });
                  }
                }
              } catch {}
              try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            }
          }
        }
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  // 크기 큰 순으로 정렬
  allImages.sort((a, b) => b.size - a.size);
  console.log(`\n총 이미지 ${allImages.length}개:`);
  for (const i of allImages.slice(0, 10)) {
    console.log(`  ${(i.size/1024).toFixed(0)}KB  ${i.name}`);
  }

  // 저장: tmp 폴더에 모두 저장 (사용자가 직접 보고 선택할 수 있도록)
  const outDir = "tmp_full_receipts_milyang";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < allImages.length; i++) {
    const img = allImages[i];
    const safe = img.name.replace(/[^\w가-힣.]/g, "_");
    const ext = (img.name.match(/\.(png|jpe?g|bmp)$/i) || ["", "png"])[1];
    fs.writeFileSync(path.join(outDir, `${String(i+1).padStart(2,"0")}_${(img.size/1024).toFixed(0)}KB_${safe.slice(-60)}`), img.buf);
  }
  console.log(`\n저장: ${outDir}/`);
}
main().catch(console.error);
