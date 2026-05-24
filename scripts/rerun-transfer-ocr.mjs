/**
 * 이체결과 확인증 패턴 행 재OCR — 받는 분 → 거래처명, 이체금액 → 합계
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import { createClient } from "@libsql/client";

const { ocrReceipt } = await import("../src/lib/integrations/ocr.ts");
const c = createClient({ url: "file:./data/app.db" });

// 모든 agency_expenses 행 중 receipt 있는 것 — rawText에 "이체결과" 포함되면 갱신
const rows = (await c.execute(
  "SELECT id, vendor_name, total_amount, supply_amount, vat_amount, receipt_file_path, receipt_mime_type FROM agency_expenses WHERE receipt_file_path IS NOT NULL ORDER BY id"
)).rows;

console.log("검사 대상:", rows.length);
let updated = 0;
for (const r of rows) {
  if (!fs.existsSync(r.receipt_file_path)) continue;
  try {
    const buf = fs.readFileSync(r.receipt_file_path);
    const ocr = await ocrReceipt(buf, r.receipt_mime_type || undefined);
    if (!/이\s*체\s*결\s*과/.test(ocr.rawText)) continue;

    const AMT_CAP = 10_000_000;
    const updates = [];
    const args = [];
    if (ocr.vendorName && ocr.vendorName !== r.vendor_name) {
      updates.push("vendor_name=?"); args.push(ocr.vendorName);
    }
    if (ocr.totalAmount && ocr.totalAmount < AMT_CAP && ocr.totalAmount !== Number(r.total_amount)) {
      updates.push("total_amount=?", "supply_amount=?", "vat_amount=?");
      // 이체확인증도 부가세 없음 (수수료는 별도, 본 거래는 supply=total)
      args.push(ocr.totalAmount, ocr.totalAmount, 0);
    }
    if (updates.length) {
      args.push(r.id);
      await c.execute({ sql: `UPDATE agency_expenses SET ${updates.join(", ")} WHERE id=?`, args });
      console.log(`+ id=${r.id} 보정: vendor=${ocr.vendorName || '-'}, total=${ocr.totalAmount || '-'}`);
      updated++;
    }
  } catch (e) {
    console.log(`! id=${r.id}: ${e.message}`);
  }
}
console.log(`\n갱신 ${updated}건`);
