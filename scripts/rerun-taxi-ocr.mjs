/**
 * 택시비 행 재OCR — 요금/공급가 보정
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import { createClient } from "@libsql/client";

const { ocrReceipt } = await import("../src/lib/integrations/ocr.ts");
const c = createClient({ url: "file:./data/app.db" });

const rows = (await c.execute(
  "SELECT id, vendor_name, total_amount, supply_amount, receipt_file_path, receipt_mime_type FROM agency_expenses WHERE subcategory='택시비' AND receipt_file_path IS NOT NULL ORDER BY id"
)).rows;

console.log("재OCR 대상:", rows.length);
let updated = 0;
for (const r of rows) {
  if (!fs.existsSync(r.receipt_file_path)) { console.log(`× 파일없음 id=${r.id}`); continue; }
  try {
    const buf = fs.readFileSync(r.receipt_file_path);
    const ocr = await ocrReceipt(buf, r.receipt_mime_type || undefined);
    const AMT_CAP = 10_000_000;
    const newTotal = ocr.totalAmount && ocr.totalAmount < AMT_CAP ? ocr.totalAmount : Number(r.total_amount);
    if (newTotal && newTotal !== Number(r.total_amount)) {
      await c.execute({
        sql: "UPDATE agency_expenses SET total_amount=?, supply_amount=?, vat_amount=0 WHERE id=?",
        args: [newTotal, newTotal, r.id],
      });
      console.log(`+ id=${r.id} ${r.vendor_name || '-'}: ${r.total_amount} → ${newTotal}`);
      updated++;
    } else if (Number(r.total_amount) > 0 && Number(r.supply_amount) !== Number(r.total_amount)) {
      await c.execute({ sql: "UPDATE agency_expenses SET supply_amount=total_amount, vat_amount=0 WHERE id=?", args: [r.id] });
      console.log(`= id=${r.id} ${r.vendor_name || '-'}: supply 동기화 (${r.total_amount})`);
      updated++;
    } else {
      console.log(`. id=${r.id} ${r.vendor_name || '-'}: 변경 없음 (현재 ${r.total_amount})`);
    }
  } catch (e) {
    console.log(`! id=${r.id}: ${e.message}`);
  }
}
console.log(`\n갱신 ${updated}건`);
