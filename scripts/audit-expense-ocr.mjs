// 기존 expenses 중 OCR 오인식 의심 건 찾아서 영수증 파일 있으면 새 파서로 재OCR → 권장 보정값 출력
// 자동 update 안 함. 운영자가 검토 후 SQL로 적용.
// 실행: npx tsx scripts/audit-expense-ocr.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const c = createClient({ url: "file:./data/app.db" });

// 의심 조건
const SUSPECT_SQL = `
  SELECT id, team_id, spent_date, category, total_amount, supply_amount, vat_amount, vendor_name, receipt_file_path, mail_from
  FROM expenses
  WHERE total_amount >= 1000000
     OR CAST(substr(spent_date, 1, 4) AS INTEGER) < 2024
     OR CAST(substr(spent_date, 1, 4) AS INTEGER) > 2027
     OR spent_date IS NULL
  ORDER BY total_amount DESC
`;

const res = await c.execute(SUSPECT_SQL);
console.log(`의심 건수: ${res.rows.length}\n`);

const { ocrReceipt } = await import("../src/lib/integrations/ocr.ts");

const recommendations = [];
for (const row of res.rows) {
  const fp = row.receipt_file_path;
  const fileOk = fp && fs.existsSync(fp);
  const tag = `id=${row.id} team=${row.team_id} ${row.spent_date} [${row.category}] ${row.total_amount?.toLocaleString()}원 ${row.vendor_name ?? '-'} | ${row.mail_from ?? '-'}`;

  if (!fileOk) {
    console.log(`⚠ ${tag}  (파일 없음: ${fp ?? '경로없음'})`);
    recommendations.push({ id: row.id, action: "수기검토필요 — 영수증 파일 없음", row });
    continue;
  }

  try {
    const buf = fs.readFileSync(fp);
    const ext = path.extname(fp).toLowerCase();
    const mime = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".bmp" ? "image/bmp" : "image/jpeg";
    const ocr = await ocrReceipt(buf, mime);

    const newTotal = ocr.totalAmount;
    const newDate = ocr.spentDate;
    const totalDiff = newTotal !== null && newTotal !== row.total_amount;
    const dateDiff = newDate && newDate !== row.spent_date;

    if (!totalDiff && !dateDiff) {
      console.log(`✓ ${tag}  (재OCR 결과 동일 → 사람 검토 필요)`);
      continue;
    }
    console.log(`✗ ${tag}`);
    console.log(`   → 새 OCR: total=${newTotal?.toLocaleString() ?? 'null'} date=${newDate ?? 'null'} vendor="${ocr.vendorName ?? '-'}"`);
    recommendations.push({ id: row.id, oldTotal: row.total_amount, newTotal, oldDate: row.spent_date, newDate, vendor: ocr.vendorName });
  } catch (e) {
    console.log(`✗ ${tag}  OCR 오류: ${e?.message ?? e}`);
  }
}

console.log(`\n=== 보정 권장 ${recommendations.length}건 ===`);
const fixable = recommendations.filter(r => r.newTotal !== undefined && r.newTotal !== null && r.newTotal < 100_000_000 && r.newTotal !== r.oldTotal);
console.log(`자동 보정 가능 후보: ${fixable.length}건\n`);
for (const r of fixable) {
  console.log(`UPDATE expenses SET total_amount=${r.newTotal}, spent_date='${r.newDate ?? r.oldDate}'${r.vendor ? `, vendor_name='${r.vendor.replace(/'/g, "''")}'` : ''} WHERE id=${r.id}; -- 기존 ${r.oldTotal?.toLocaleString()}원 → ${r.newTotal?.toLocaleString()}원`);
}
