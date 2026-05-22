import fs from "fs";
import { createClient } from "@libsql/client";
import { ocrReceipt } from "../src/lib/integrations/ocr";

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  const rows = (await c.execute(
    `SELECT id, vendor_name, memo, receipt_file_path, card_type FROM agency_expenses WHERE memo LIKE '%260520%우편비%차선애%'`
  )).rows as any[];
  for (const r of rows) {
    console.log(`\n=== id ${r.id} | card_type=${r.card_type} | ${r.memo} ===`);
    if (!fs.existsSync(r.receipt_file_path)) {
      console.log("파일 없음");
      continue;
    }
    const buf = fs.readFileSync(r.receipt_file_path);
    const parsed = await ocrReceipt(buf);
    console.log("OCR cardType:", parsed.cardType, "last4:", parsed.cardLast4);
    console.log("rawText (앞 600자):");
    console.log(parsed.rawText.slice(0, 600));
  }
}
main().catch(console.error);
