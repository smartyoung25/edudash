// 알려진 영수증 5건을 새 파서로 돌려서 결과 출력 (회귀 테스트)
// 실행: npx tsx scripts/test-ocr-fixtures.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import fs from "fs";
import path from "path";

const { ocrReceipt } = await import("../src/lib/integrations/ocr.ts");

const FIXTURES = [
  { id: 169, path: "data/receipts/27/1779628270763_tobayx.jpg", expected: { total: 92000, date: "2026-02-26", vendor: "육장갈비함덕점" } },
  { id: 60,  path: "data/receipts/27/1779436846918_e7in1m.jpg", expected: { total: 112000, date: "2026-03-04", vendor: "넝쿨하늘가든" } },
  { id: 61,  path: "data/receipts/27/1779436847151_vzavo0.jpg", expected: { total: 13500,  date: "2026-03-04", vendor: "CU 제주오등동점" } },
  { id: 62,  path: "data/receipts/27/1779436847379_w5tiht.jpg", expected: { total: 100000, date: null,         vendor: "달마야해물탕" } },
  { id: 59,  path: "data/receipts/27/1779436846653_ej0gnc.jpg", expected: { total: 95000,  date: null,         vendor: null } },
  // 강사비 양식 (수당 지급 확인서) — id=64 (밀양)
  { id: 64,  path: "data/receipts/16/milyang_full_1779450106779.jpg", expected: { total: null, date: null, vendor: null } },
];

let pass = 0, fail = 0;
for (const f of FIXTURES) {
  if (!fs.existsSync(f.path)) { console.log(`SKIP id=${f.id} (file not found: ${f.path})`); continue; }
  const buf = fs.readFileSync(f.path);
  const ext = path.extname(f.path).toLowerCase();
  const mime = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
  try {
    const r = await ocrReceipt(buf, mime);
    const totalOk = f.expected.total === null ? true : r.totalAmount === f.expected.total;
    const dateOk = f.expected.date === null || r.spentDate === f.expected.date;
    const vendorOk = f.expected.vendor === null || (r.vendorName && r.vendorName.includes(f.expected.vendor.slice(0, 4)));
    const status = totalOk && dateOk && vendorOk ? "✓ PASS" : "✗ FAIL";
    if (totalOk && dateOk && vendorOk) pass++; else fail++;
    console.log(`${status} id=${f.id}  total=${r.totalAmount?.toLocaleString() ?? 'null'} (기대 ${f.expected.total?.toLocaleString() ?? '-'})  date=${r.spentDate} (기대 ${f.expected.date ?? '-'})  vendor="${r.vendorName ?? '-'}" (기대 ${f.expected.vendor ?? '-'})`);
  } catch (e) {
    fail++;
    console.log(`✗ ERROR id=${f.id}: ${e.message}`);
  }
}
console.log(`\n=== ${pass} pass / ${fail} fail ===`);
