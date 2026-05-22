// 추출된 이미지들을 OCR 돌려서 영수증인지 확인
import "dotenv/config";
import fs from "fs";
import path from "path";
import { ocrReceipt } from "../src/lib/integrations/ocr";

async function main() {
const root = "tmp_kim_attachments";
const dirs = fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory());

for (const d of dirs) {
  const dirPath = path.join(root, d);
  const files = fs.readdirSync(dirPath).filter(f =>
    /\.(png|jpg|jpeg|bmp)$/i.test(f) && !f.startsWith("PrvImage")
  );
  if (files.length === 0) continue;
  console.log(`\n=== ${d} ===`);
  for (const f of files) {
    const fp = path.join(dirPath, f);
    const buf = fs.readFileSync(fp);
    if (buf.length < 5000) { console.log(`  ${f}: too small, skip`); continue; }
    try {
      const r = await ocrReceipt(buf);
      const hasReceiptKeywords = /(공급가|부가세|합계|영수증|승인금액|판매금|사업자|등록번호)/.test(r.rawText);
      const summary = `${f} → ${hasReceiptKeywords ? "✅영수증" : "❌영수증아님"} ` +
        `vendor=${r.vendorName ?? "-"} biz=${r.vendorBizNo ?? "-"} date=${r.spentDate ?? "-"} ` +
        `supply=${r.supplyAmount ?? "-"} vat=${r.vatAmount ?? "-"} total=${r.totalAmount ?? "-"}`;
      console.log(`  ${summary}`);
    } catch (e) {
      console.log(`  ${f}: OCR 실패 ${e.message}`);
    }
  }
}
}
main().catch(console.error);
