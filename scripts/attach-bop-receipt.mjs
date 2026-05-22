import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

const src = "C:/Users/IIamHub2/Documents/네이트온 받은 파일/260522 야근저녁식대.jpg";
if (!fs.existsSync(src)) {
  console.error("파일 없음:", src);
  process.exit(1);
}
const buf = fs.readFileSync(src);
const dir = "data/receipts/agency-travel";
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const dst = path.join(dir, `etc_${Date.now()}_bop.jpg`).replace(/\\/g, "/");
fs.writeFileSync(dst, buf);
console.log("파일 저장:", dst);

const c = createClient({ url: "file:./data/app.db" });
const r = await c.execute({
  sql: "UPDATE agency_expenses SET receipt_file_path=?, receipt_mime_type='image/jpeg' WHERE kind='기타경비' AND vendor_name='비오피 BOP 용산점' AND spent_date='2026-05-22'",
  args: [dst],
});
console.log("UPDATE rowsAffected:", r.rowsAffected);
