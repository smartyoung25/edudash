import fs from "fs";
import { createClient } from "@libsql/client";
import { ocrReceipt } from "../src/lib/integrations/ocr";

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  const rows = (await c.execute(
    `SELECT id, vendor_name, memo, receipt_file_path, receipt_mime_type
     FROM agency_expenses
     WHERE kind='기타경비' AND receipt_file_path IS NOT NULL`
  )).rows as any[];

  let updated = 0;
  for (const r of rows) {
    if (!fs.existsSync(r.receipt_file_path)) continue;
    const buf = fs.readFileSync(r.receipt_file_path);
    try {
      const parsed = await ocrReceipt(buf, r.receipt_mime_type === "application/pdf" ? "application/pdf" : undefined);
      const text = parsed.rawText;
      // 쿠팡 키워드 검색
      const hasCoupang = /쿠팡|coupang/i.test(text);
      if (hasCoupang) {
        // 어떤 행이 쿠팡 관련인지 출력
        if (!r.vendor_name || !/쿠팡/.test(r.vendor_name)) {
          await c.execute({ sql: "UPDATE agency_expenses SET vendor_name='쿠팡(주)' WHERE id=?", args: [r.id] });
          console.log(`  id ${r.id}: '${r.vendor_name ?? "(none)"}' → '쿠팡(주)' (${r.memo?.slice(0, 40) ?? ""})`);
          updated++;
        }
      }
    } catch {}
  }
  console.log(`\n쿠팡 식별: ${updated}건 업데이트`);
}
main().catch(console.error);
