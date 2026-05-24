/**
 * agency_expenses 중 receipt_file 존재 행을 재OCR 하여 택시 영수증이면 subcategory='택시비' 로 보정
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import { createClient } from "@libsql/client";

const { ocrReceipt, isTaxiReceipt, isTrainReceipt, isRideHailVendor } = await import("../src/lib/integrations/ocr.ts");
const c = createClient({ url: "file:./data/app.db" });

// 택시비/교통비(기차)는 둘 다 출장비 subcategory, 기차표는 별도 enum이 없으니 '교통비'로 두되 vendor를 KORAIL로 정규화
const rows = (await c.execute(
  "SELECT id, subcategory, receipt_file_path, receipt_mime_type, vendor_name FROM agency_expenses WHERE kind='출장비' AND receipt_file_path IS NOT NULL"
)).rows;

console.log("검사 대상:", rows.length);
let fixed = 0, skipped = 0, errs = 0;
for (const r of rows) {
  if (!fs.existsSync(r.receipt_file_path)) { skipped++; continue; }
  try {
    const buf = fs.readFileSync(r.receipt_file_path);
    const ocr = await ocrReceipt(buf, r.receipt_mime_type || undefined);
    const taxi = isTaxiReceipt(ocr.rawText) || isRideHailVendor(ocr.vendorName) || isRideHailVendor(r.vendor_name);
    if (taxi && r.subcategory !== '택시비') {
      await c.execute({ sql: "UPDATE agency_expenses SET subcategory='택시비' WHERE id=?", args: [r.id] });
      console.log(`+ id=${r.id} ${r.subcategory}→택시비 (${r.vendor_name || '-'})`);
      fixed++;
    } else if (isTrainReceipt(ocr.rawText)) {
      // 기차표: subcategory=교통비, vendor_name=한국철도공사(KORAIL)로 통일
      const updates = [];
      const args = [];
      if (r.subcategory !== '교통비') { updates.push("subcategory='교통비'"); }
      if (!r.vendor_name || !/(KORAIL|코레일|한국철도공사)/i.test(r.vendor_name)) {
        updates.push("vendor_name=?"); args.push("한국철도공사(KORAIL)");
      }
      if (updates.length) {
        args.push(r.id);
        await c.execute({ sql: `UPDATE agency_expenses SET ${updates.join(', ')} WHERE id=?`, args });
        console.log(`+ id=${r.id} ${r.subcategory}/${r.vendor_name || '-'} → 기차(교통비/KORAIL)`);
        fixed++;
      }
    }
  } catch (e) {
    errs++;
    console.log(`! id=${r.id}: ${e.message}`);
  }
}
console.log(`\n보정 ${fixed}건 / 스킵 ${skipped}건 / 오류 ${errs}건`);
