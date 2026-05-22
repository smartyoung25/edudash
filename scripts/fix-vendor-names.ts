import { createClient } from "@libsql/client";
import fs from "fs";
import { ocrReceipt } from "../src/lib/integrations/ocr";

// 파일명에서 거래처명 힌트 추출
function vendorFromFilename(name: string): string | null {
  const n = name.toLowerCase();
  if (/우편비|우체국/.test(name)) return "우체국";
  if (/네이버/.test(name)) return "네이버";
  if (/기프티팡/.test(name)) return "기프티팡";
  if (/genspike/i.test(name)) return "GENSPIKE";
  return null;
}

// 잘못된 vendor_name 패턴 (OCR 노이즈)
const BAD_VENDOR_PATTERNS = [
  /^[크크]+\s*[,\.]/,
  /^[,.\s]/,
  /매입사|카드사명|발행사명|매입사명|카드사|승인사/,
  /가맹점주소가/,
  /^[일|이|삼|사|오|육|칠|팔|구|영|영수증|VAT|TAX]+$/,
  /^\d/,
  /^(NH|IBK|국민|신한|삼성|현대|롯데|BC|비씨)\s*카드/,
  /^정보$/,
  /^번호\s*[:：]/,
  /^[\d\-]{5,}$/,
  /^최종\s*변경/,
  /\b\d{4}\.\d{2}\.\d{2}\b/,
  /^신용\s*거래/,
  /^판매자/,
  /^상품명/,
  /^한국G$/,
  /^(영수증|TAX|INVOICE|일반|VAT|매출전표|승인|결제)/i,
  /^[A-Z]\s*$/,
  /^주\s*소/,
];

function isBadVendor(name: string | null): boolean {
  if (!name) return false;
  const trim = name.trim();
  if (trim.length < 2 || trim.length > 30) return true;
  for (const p of BAD_VENDOR_PATTERNS) if (p.test(trim)) return true;
  return false;
}

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  let updated = 0;
  for (const table of ["expenses", "agency_expenses"]) {
    const attachmentCol = table === "expenses" ? "attachment_name" : "memo";
    const rows = (await c.execute(
      `SELECT id, vendor_name, ${attachmentCol} as fname, receipt_file_path, receipt_mime_type FROM ${table}`
    )).rows as any[];
    console.log(`\n=== ${table} (${rows.length}건) ===`);
    for (const r of rows) {
      let newVendor: string | null = r.vendor_name;
      if (isBadVendor(r.vendor_name)) newVendor = null;

      // 우선순위 1: 깨끗한 vendor_name 유지
      if (newVendor) continue;

      // 우선순위 2: 파일명에서 추정
      const filenameHint = r.fname ? vendorFromFilename(r.fname) : null;
      if (filenameHint) {
        await c.execute({ sql: `UPDATE ${table} SET vendor_name=? WHERE id=?`, args: [filenameHint, r.id] });
        updated++;
        console.log(`  id ${r.id}: ${r.vendor_name || "(none)"} → ${filenameHint} (파일명)`);
        continue;
      }

      // 우선순위 3: 영수증 재OCR (새 로직)
      if (r.receipt_file_path && fs.existsSync(r.receipt_file_path)) {
        try {
          const buf = fs.readFileSync(r.receipt_file_path);
          const parsed = await ocrReceipt(buf, r.receipt_mime_type === "application/pdf" ? "application/pdf" : undefined);
          if (parsed.vendorName && !isBadVendor(parsed.vendorName)) {
            await c.execute({ sql: `UPDATE ${table} SET vendor_name=? WHERE id=?`, args: [parsed.vendorName, r.id] });
            updated++;
            console.log(`  id ${r.id}: ${r.vendor_name || "(none)"} → ${parsed.vendorName} (재OCR)`);
            continue;
          }
        } catch {}
      }

      // 마지막: null 처리 (기존 노이즈 제거)
      if (r.vendor_name && isBadVendor(r.vendor_name)) {
        await c.execute({ sql: `UPDATE ${table} SET vendor_name=NULL WHERE id=?`, args: [r.id] });
        updated++;
        console.log(`  id ${r.id}: ${r.vendor_name} → (제거)`);
      }
    }
  }
  console.log(`\n총 ${updated}건 업데이트`);
}
main().catch(console.error);
