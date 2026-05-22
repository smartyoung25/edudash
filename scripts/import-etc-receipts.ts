import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
import { ocrReceipt } from "../src/lib/integrations/ocr";

const ROOT = "tmp_etc_receipts";
const RECEIPTS_DIR = "data/receipts/agency-travel"; // 기관경비는 같은 폴더 공유

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function pickExt(name: string) {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g)$/);
  return m ? `.${m[1]}` : ".bin";
}
function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.match(/\.jpe?g/)) return "image/jpeg";
  return "application/octet-stream";
}

// 파일명에서 날짜 (YYMMDD or YYYYMMDD) 추출
function parseFilenameDate(name: string): string | null {
  // 우선: 20YYMMDD 또는 YYYYMMDD 8자리
  const m8 = name.match(/\b(20\d{2}|19\d{2})(\d{2})(\d{2})\b/);
  if (m8) {
    const mo = parseInt(m8[2], 10), d = parseInt(m8[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${m8[1]}-${m8[2]}-${m8[3]}`;
  }
  // 그 다음: YYMMDD 6자리 — 단어경계 또는 시작/공백 뒤
  const m6 = name.match(/(?:^|[\s_\-])(\d{2})(\d{2})(\d{2})(?:\s|_|\.|-)/);
  if (m6) {
    const yy = parseInt(m6[1], 10);
    const mo = parseInt(m6[2], 10), d = parseInt(m6[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const fullY = yy < 50 ? 2000 + yy : 1900 + yy;
      return `${fullY}-${m6[2]}-${m6[3]}`;
    }
  }
  return null;
}

// 파일명에서 금액 (XXXX원, XX,XXX원) 추출
function parseFilenameAmount(name: string): number | null {
  const m = name.match(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return n > 0 && n < 100_000_000 ? n : null;
}

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  const files = fs.readdirSync(ROOT).filter((f) => /\.(pdf|jpe?g|png)$/i.test(f));
  console.log(`처리 대상: ${files.length}개`);

  let registered = 0;
  let skippedDup = 0;
  ensureDir(RECEIPTS_DIR);

  for (const f of files) {
    const full = path.join(ROOT, f);
    const buf = fs.readFileSync(full);
    if (buf.length < 1000) continue;

    const fileDate = parseFilenameDate(f);
    const fileAmount = parseFilenameAmount(f);

    let ocrResult: any = null;
    try {
      ocrResult = await ocrReceipt(buf, f.toLowerCase().endsWith(".pdf") ? "application/pdf" : undefined);
    } catch (e: any) {
      console.log(`  ${f}: OCR 실패 ${e.message}`);
    }

    // 메타데이터 우선순위
    // 날짜: 파일명에 명시되어 있으면 우선 (OCR 오류 잦음)
    const spentDate = fileDate || ocrResult?.spentDate || new Date().toISOString().slice(0, 10);

    // 금액: 파일명에 명시되어 있으면 우선 (OCR이 카드번호를 금액으로 오인식하는 경우 잦음)
    let total: number;
    let supply: number;
    let vat: number;
    if (fileAmount) {
      total = fileAmount;
      supply = Math.round(total / 1.1);
      vat = total - supply;
    } else {
      total = ocrResult?.totalAmount ?? 0;
      supply = ocrResult?.supplyAmount ?? 0;
      vat = ocrResult?.vatAmount ?? 0;
      // OCR 금액이 비정상 (>5백만) 이면 의심
      if (total > 5_000_000) {
        console.log(`  ${f}: OCR 금액 ${total.toLocaleString()} 비정상 → 스킵`);
        continue;
      }
    }
    if (total <= 0) {
      console.log(`  ${f}: 금액 추출 실패 → 스킵`);
      continue;
    }

    // 중복 확인: 같은 날짜+같은 금액+같은 거래처가 이미 있는지
    const dup = await c.execute({
      sql: `SELECT id FROM agency_expenses WHERE kind='기타경비' AND spent_date=? AND total_amount=? AND COALESCE(vendor_biz_no,'')=COALESCE(?,'')`,
      args: [spentDate, total, ocrResult?.vendorBizNo ?? null],
    });
    if (dup.rows.length > 0) {
      skippedDup++;
      console.log(`  ${f}: 중복 스킵 (${spentDate} ${total.toLocaleString()})`);
      continue;
    }

    // 영수증 파일 저장
    const safeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = pickExt(f);
    const rel = path.join(RECEIPTS_DIR, `etc_${safeId}${ext}`).replace(/\\/g, "/");
    fs.writeFileSync(rel, buf);
    const mime = guessMime(f);

    await c.execute({
      sql: `INSERT INTO agency_expenses(kind,spent_date,supply_amount,vat_amount,total_amount,vendor_type,vendor_biz_no,vendor_name,vendor_ceo,card_type,card_last4,memo,receipt_file_path,receipt_mime_type)
            VALUES('기타경비',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [spentDate, supply, vat, total, ocrResult?.vendorType ?? null, ocrResult?.vendorBizNo ?? null, ocrResult?.vendorName ?? null, ocrResult?.vendorCeo ?? null, ocrResult?.cardType ?? null, ocrResult?.cardLast4 ?? null, f, rel, mime],
    });
    registered++;
    console.log(`  ✓ ${spentDate} ${total.toLocaleString()}원 — ${f.slice(0, 50)}`);
  }
  console.log(`\n총 등록: ${registered}건, 중복 스킵: ${skippedDup}건`);
}
main().catch(console.error);
