import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const c = createClient({ url: "file:./data/app.db" });

// =====  식대/다과 당일 아닌 것 회차 미지정으로 =====
const meals = (await c.execute(`
  SELECT e.id, e.team_id, e.spent_date, e.session_no, e.category, s.scheduled_date
  FROM expenses e
  LEFT JOIN sessions s ON s.team_id = e.team_id AND s.session_no = e.session_no
  WHERE e.category = '식대' AND e.session_no IS NOT NULL
`)).rows;

let reset = 0;
for (const m of meals) {
  if (m.scheduled_date && m.spent_date !== m.scheduled_date) {
    await c.execute({ sql: "UPDATE expenses SET session_no=NULL WHERE id=?", args: [m.id] });
    console.log(`  reset id=${m.id}: ${m.category} ${m.spent_date} → ${m.session_no}회차(${m.scheduled_date}) 미지정`);
    reset++;
  }
}
console.log(`식대/다과 ${reset}건 회차 해제`);

// =====  밀양딸기 영수증 큰 버전으로 교체 =====
const expenseId = 64;
const row = (await c.execute({ sql: "SELECT * FROM expenses WHERE id=?", args: [expenseId] })).rows[0];
if (!row) {
  console.log("\n밀양딸기 영수증 없음");
} else {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: 993, secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ from: "37210114ok@gmail.com" }, { uid: true });
    for (const uid of uids || []) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg?.source) continue;
      const parsed = await simpleParser(msg.source);
      if (!parsed.subject?.includes("밀양딸기육묘팀 2차")) continue;

      for (const att of parsed.attachments) {
        if (!att.filename?.endsWith(".zip")) continue;
        const zip = new AdmZip(att.content);
        for (const e of zip.getEntries()) {
          if (!e.entryName.includes("강사비")) continue;
          // HWP 파일에서 가장 큰 이미지 추출 (Python)
          const tmpDir = fs.mkdtempSync(path.join((await import("os")).default.tmpdir(), "hwp-"));
          const tmpFile = path.join(tmpDir, "in.hwp");
          fs.writeFileSync(tmpFile, e.getData());
          const { execFileSync } = await import("child_process");
          try {
            const out = execFileSync("C:/Users/IIamHub2/AppData/Local/Python/bin/python.exe", ["scripts/extract_hwp_images.py", tmpFile, tmpDir], { encoding: "utf-8", timeout: 60000 });
            const r = JSON.parse(out);
            if (r.ok && r.images.length) {
              // 가장 큰 이미지
              const biggest = r.images.sort((a, b) => b.size - a.size)[0];
              const buf = fs.readFileSync(biggest.path);
              const newPath = `data/receipts/16/milyang_full_${Date.now()}${path.extname(biggest.path)}`;
              fs.writeFileSync(newPath, buf);
              const mime = biggest.path.endsWith(".jpeg") || biggest.path.endsWith(".jpg") ? "image/jpeg"
                : biggest.path.endsWith(".png") ? "image/png" : "application/octet-stream";
              await c.execute({
                sql: "UPDATE expenses SET receipt_file_path=?, receipt_mime_type=? WHERE id=?",
                args: [newPath, mime, expenseId],
              });
              console.log(`\n밀양딸기 영수증 교체: ${biggest.name} (${(biggest.size/1024).toFixed(0)}KB) → ${newPath}`);
            }
          } catch (e) { console.log("Python 오류:", e.message); }
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        }
      }
      break;
    }
  } finally {
    lock.release();
    await client.logout();
  }
}
