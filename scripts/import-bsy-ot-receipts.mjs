/**
 * 방서연 OT 출장 영수증 폴더 → agency_expenses 자동 등록
 * - 파일명에서 trip_name, subcategory, doc_type 추론
 * - OCR 로 vendor/amount/date 추출
 * - 거래명세서는 doc_type='거래명세표' (합산 제외)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

const { ocrReceipt, isTaxiReceipt, isRideHailVendor } = await import("../src/lib/integrations/ocr.ts");

const SRC_DIR = "OT 출장 영수증_방서연/OT 출장 영수증";
const RECEIPTS_DIR = "data/receipts/agency-travel";
const c = createClient({ url: "file:./data/app.db" });

const TRIP_MAP = [
  { re: /배\s*1\s*기\s*OT/i,  trip: "[2026 성장농] 배 1기 OT" },
  { re: /배\s*2\s*기\s*OT|배\s*OT/i,  trip: "[2026 성장농] 배 2기 OT" },
  { re: /토마토\s*7\s*기\s*OT|토마토\s*OT/i, trip: "[2026 성장농] 토마토 7기 OT" },
  { re: /딸기\s*15\s*기\s*OT|딸기\s*15기/i, trip: "[2026 성장농] 딸기 15기 OT" },
  { re: /딸기\s*16\s*기\s*OT|딸기\s*16기/i, trip: "[2026 성장농] 딸기 16기 OT" },
  { re: /감귤\s*4\s*기\s*OT|제주/i,      trip: "[2026 성장농] 감귤 4기 OT (제주)" },
  { re: /농정원/i,                       trip: "농정원 회의 출장" },
];

const SUBCAT_MAP = [
  { re: /거래명세서/i, sub: "다과비", docType: "거래명세표" },
  { re: /식대|식비/i,             sub: "식비",   docType: "영수증" },
  { re: /다과|간식/i,             sub: "다과비", docType: "영수증" },
  { re: /비행기|항공/i,           sub: "교통비", docType: "영수증" },
  { re: /교통|KTX|기차|버스|택시/i, sub: "교통비", docType: "영수증" },
  { re: /숙박|호텔|모텔/i,        sub: "숙박비", docType: "영수증" },
];

function pickTrip(name) {
  for (const { re, trip } of TRIP_MAP) if (re.test(name)) return trip;
  return null;
}
function pickSub(name) {
  for (const { re, sub, docType } of SUBCAT_MAP) if (re.test(name)) return { sub, docType };
  return { sub: "기타", docType: "영수증" };
}
function pickDateFromName(name) {
  // 0129, 260210, 2026-01-29 등에서 추출
  const m1 = name.match(/(2026|26)[-_]?(\d{2})[-_]?(\d{2})/);
  if (m1) { const y = m1[1].length === 2 ? '20' + m1[1] : m1[1]; return `${y}-${m1[2]}-${m1[3]}`; }
  const m2 = name.match(/^(\d{2})(\d{2})[\s_]/);
  if (m2) return `2026-${m2[1]}-${m2[2]}`;
  return null;
}
function guessMime(name) {
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
function pickExt(name) {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g)$/);
  return m ? `.${m[1]}` : ".bin";
}

if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const files = fs.readdirSync(SRC_DIR).filter(f => /\.(pdf|png|jpe?g)$/i.test(f));
console.log("총 파일:", files.length);

let created = 0, skipped = 0;
const errors = [];

for (const file of files) {
  const full = path.join(SRC_DIR, file);
  let trip = pickTrip(file);
  // 0129~0130 패턴 → 배1기 OT 매핑
  if (!trip && /^0129-0130/.test(file)) trip = "[2026 성장농] 배 1기 OT";
  if (!trip) { console.log(`× trip 추론 실패: ${file}`); skipped++; continue; }
  let { sub, docType } = pickSub(file);
  const fileDate = pickDateFromName(file);

  // dedup: 파일명 기반
  const dedupKey = `bsy-ot:${file}`;
  const dup = await c.execute({ sql: "SELECT id FROM agency_expenses WHERE dedup_key=? LIMIT 1", args: [dedupKey] });
  if (dup.rows.length) { console.log(`✓ 이미 등록됨: ${file}`); skipped++; continue; }

  try {
    const buf = fs.readFileSync(full);
    const ocr = await ocrReceipt(buf, guessMime(file));
    // 택시(영수증/호출가맹점)면 subcategory 강제 보정
    const isTaxi = isTaxiReceipt(ocr.rawText) || isRideHailVendor(ocr.vendorName);
    if (isTaxi) sub = "택시비";

    // OCR 검증
    const AMT_CAP = 10_000_000;
    const validDate = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d) && +d.slice(0,4) >= 2024 && +d.slice(0,4) <= 2030;
    const total = ocr.totalAmount > 0 && ocr.totalAmount < AMT_CAP ? ocr.totalAmount : 0;
    // 택시: 요금 전액=공급가, 부가세=0
    const supply = isTaxi ? total : (ocr.supplyAmount && ocr.supplyAmount < AMT_CAP ? ocr.supplyAmount : Math.round(total/1.1));
    const vat = isTaxi ? 0 : (ocr.vatAmount && ocr.vatAmount < AMT_CAP ? ocr.vatAmount : (total - supply));
    const spentDate = validDate(ocr.spentDate) ? ocr.spentDate : (fileDate || "2026-01-01");

    // 파일 복사
    const safeId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const dest = path.join(RECEIPTS_DIR, `${safeId}${pickExt(file)}`);
    fs.copyFileSync(full, dest);

    await c.execute({
      sql: `INSERT INTO agency_expenses
        (kind, subcategory, trip_name, spent_date, supply_amount, vat_amount, total_amount,
         vendor_type, vendor_biz_no, vendor_name, vendor_ceo, card_type, card_last4,
         payer_name, doc_type, receipt_file_path, receipt_mime_type, dedup_key, memo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: ["출장비", sub, trip, spentDate, supply, vat, total,
        ocr.vendorType, ocr.vendorBizNo, ocr.vendorName, ocr.vendorCeo, ocr.cardType, ocr.cardLast4,
        "방서연", docType, dest.replace(/\\/g, "/"), guessMime(file), dedupKey, null],
    });
    console.log(`+ ${trip} / ${sub} / ${spentDate} / ${ocr.vendorName ?? "-"} / ${total.toLocaleString()}원 ← ${file}`);
    created++;
  } catch (e) {
    errors.push(`${file}: ${e.message}`);
    console.log(`! ${file}: ${e.message}`);
  }
}

console.log(`\n신규 ${created}건 / 스킵 ${skipped}건 / 오류 ${errors.length}건`);
if (errors.length) errors.forEach(e => console.log(" -", e));
