import "dotenv/config";
import fs from "fs";
import { createClient } from "@libsql/client";
import { ocrReceipt } from "../src/lib/integrations/ocr";

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  // 양쪽 테이블 모두
  let totalUpdated = 0;

  for (const table of ["expenses", "agency_expenses"]) {
    const rows = (await c.execute(`SELECT id, receipt_file_path, receipt_mime_type, card_type FROM ${table} WHERE receipt_file_path IS NOT NULL`)).rows as any[];
    console.log(`\n=== ${table} (${rows.length}건) ===`);
    for (const r of rows) {
      if (!fs.existsSync(r.receipt_file_path)) continue;
      const buf = fs.readFileSync(r.receipt_file_path);
      try {
        const parsed = await ocrReceipt(buf, r.receipt_mime_type === "application/pdf" ? "application/pdf" : undefined);
        if (parsed.cardType && parsed.cardType !== r.card_type) {
          await c.execute({
            sql: `UPDATE ${table} SET card_type=?, card_last4=COALESCE(?,card_last4) WHERE id=?`,
            args: [parsed.cardType, parsed.cardLast4, r.id],
          });
          console.log(`  id ${r.id}: ${r.card_type || "(none)"} → ${parsed.cardType}${parsed.cardLast4 ? " ****" + parsed.cardLast4 : ""}`);
          totalUpdated++;
        }
      } catch (e: any) {
        // 무시
      }
    }
  }
  console.log(`\n총 업데이트: ${totalUpdated}건`);
}
main().catch(console.error);
