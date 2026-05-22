import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { createClient } from "@libsql/client";
import { ocrReceipt } from "../src/lib/integrations/ocr";

const TEAM_ID = 29; // 한우7기 (한우해움 인제)
const ROOT = "tmp_haewoom";
const RECEIPTS_DIR = "data/receipts";

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function pickExt(name: string) {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g|bmp)$/);
  return m ? `.${m[1]}` : ".bin";
}
function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.match(/\.jpe?g/)) return "image/jpeg";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

function extractHwpImages(hwpPath: string): string[] {
  const pythonPath = "C:/Users/IIamHub2/AppData/Local/Python/bin/python.exe";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hwp-"));
  try {
    const out = execFileSync(pythonPath, ["scripts/extract_hwp_images.py", hwpPath, tmpDir], { encoding: "utf-8", timeout: 60000 });
    const parsed = JSON.parse(out);
    if (!parsed.ok) return [];
    return parsed.images.map((i: any) => i.path);
  } catch (e) {
    return [];
  }
}

const RESTAURANT_RE = /(식당|식사|음식|밥|국밥|구이|찌개|국수|면|한식|중식|일식|양식|뷔페|치킨|버거|돈까스|족발|보쌈|삼겹|갈비|회|초밥|짜장|짬뽕|볶음|덮밥|비빔|김밥|분식|떡볶이|순대|만두|쌀국수|우동|라면|피자|파스타|스테이크|샐러드|맥도날드|롯데리아|버거킹|kfc|bbq|교촌|네네|굽네|훌랄라|푸드|수산|횟집|포차|주점|선술집|장어|꼬치|닭갈비|냉면|곱창|막창|쌈밥|돼지국밥|설렁탕|곰탕|순두부|콩나물|불고기|찜닭|돼지|소고기|닭|오리|곱|장|샤브)/;
const CAFE_RE = /(카페|커피|coffee|cafe|음료|아이스|아메리카노|라떼|에스프레소|스타벅스|이디야|투썸|메가커피|컴포즈|빽다방|할리스|폴바셋|블루보틀|다과|간식|쿠키|빵|베이커리|디저트|파리바게뜨|뚜레쥬르|샌드위치|토스트|와플|마카롱|케이크|크로플|쥬스|스무디|밀크|티)/;

function guessCategory(text: string, vendorName: string | null, spentTime: string | null) {
  const hay = (text + " " + (vendorName ?? "")).toLowerCase();
  const hour = spentTime ? parseInt(spentTime.split(":")[0], 10) : null;
  if (/(항공|airline|asiana|korean\s*air|에어부산|제주항공|진에어|이스타|티웨이|jeju\s*air|kobus|고속버스|시외버스|ktx|srt|기차|티켓|코레일|카카오모빌리티|티머니|t-money|택시|렌터카|렌트카|주유|주유소|gs칼텍스|sk에너지|에쓰오일|s-oil|hyundai oilbank|현대오일뱅크|하이패스|통행료|주차)/i.test(hay)) return "출장비";
  if (/(호텔|숙박|모텔|펜션|리조트|게스트|숙소|민박|콘도|hotel|inn|stay\b|guesthouse)/i.test(hay)) return "숙박";
  if (/(임차|대여|렌터|차량.*대여|버스대여|렌트|회의실|장소.*대여|공간.*대여)/i.test(hay)) return "임차비";
  if (/(교재|용품|문구|재료|책|복사|인쇄|문구점|다이소|이마트|코스트코|홈플러스|마트|롯데마트|온누리|사무용품|프린트|토너|잉크)/.test(hay)) return "재료비";
  if (CAFE_RE.test(hay)) return "다과";
  if (RESTAURANT_RE.test(hay)) return "식대";
  if (hour !== null) {
    if ((hour >= 7 && hour <= 9) || (hour >= 11 && hour <= 14) || (hour >= 17 && hour <= 21)) return "식대";
  }
  return "기타";
}

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  let created = 0;

  const sessions = fs.readdirSync(ROOT).filter(d => fs.statSync(path.join(ROOT, d)).isDirectory());
  for (const sess of sessions) {
    const sessNoMatch = sess.match(/(\d+)차/);
    const sessionNo = sessNoMatch ? Number(sessNoMatch[1]) : null;
    const dateMatch = sess.match(/(\d{4})?\s*(\d{2})(\d{2})/);
    const sessDateFromDir = dateMatch
      ? `${dateMatch[1] || "2026"}-${dateMatch[2]}-${dateMatch[3]}`
      : null;
    const dir = path.join(ROOT, sess);
    const files = fs.readdirSync(dir);
    console.log(`\n=== ${sess} (${sessionNo}회차) ===`);
    for (const f of files) {
      if (!/경비품의서/.test(f)) continue;
      const hwpPath = path.join(dir, f);
      console.log(`  처리: ${f}`);
      const imgs = extractHwpImages(hwpPath);
      console.log(`    추출 이미지 ${imgs.length}개`);
      for (const imgPath of imgs) {
        const buf = fs.readFileSync(imgPath);
        if (buf.length < 5000) continue;
        try {
          const ocr = await ocrReceipt(buf);
          if (!/(공급가|부가세|합계|영수증|승인금액|판매금|사업자|등록번호)/.test(ocr.rawText)) continue;
          const supply = ocr.supplyAmount ?? 0;
          const vat = ocr.vatAmount ?? 0;
          let total = ocr.totalAmount ?? supply + vat;
          if (total <= 0 || total > 5_000_000) continue;

          let category = guessCategory(ocr.rawText, ocr.vendorName, ocr.spentTime);
          // 한우7기 카페오늘 룰
          if (ocr.vendorName && /카페오늘/.test(ocr.vendorName)) {
            category = total === 200000 ? "임차비" : "다과";
          }
          // 출장비 → 기관경비, 그 외 → 팀별정산
          const isAgency = category === "출장비";
          const spent = ocr.spentDate ?? sessDateFromDir ?? new Date().toISOString().slice(0, 10);

          // 영수증 저장
          const subDir = isAgency ? "agency-travel" : String(TEAM_ID);
          ensureDir(path.join(RECEIPTS_DIR, subDir));
          const safeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const ext = pickExt(imgPath);
          const rel = path.join(RECEIPTS_DIR, subDir, `${safeId}${ext}`).replace(/\\/g, "/");
          fs.writeFileSync(rel, buf);
          const mime = guessMime(imgPath);

          if (isAgency) {
            await c.execute({
              sql: `INSERT INTO agency_expenses(kind,spent_date,supply_amount,vat_amount,total_amount,vendor_type,vendor_biz_no,vendor_name,vendor_ceo,card_type,card_last4,memo,receipt_file_path,receipt_mime_type)
                    VALUES('출장비',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              args: [spent, supply, vat, total, ocr.vendorType, ocr.vendorBizNo, ocr.vendorName, ocr.vendorCeo, ocr.cardType, ocr.cardLast4, `한우해움 ${sessionNo}회차 (수동 ZIP 임포트)`, rel, mime],
            });
          } else {
            await c.execute({
              sql: `INSERT INTO expenses(team_id,session_no,spent_date,category,supply_amount,vat_amount,total_amount,vendor_type,vendor_biz_no,vendor_name,vendor_ceo,card_type,card_last4,memo,source,attachment_name,receipt_file_path,receipt_mime_type)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'mail',?,?,?)`,
              args: [TEAM_ID, sessionNo, spent, category, supply, vat, total, ocr.vendorType, ocr.vendorBizNo, ocr.vendorName, ocr.vendorCeo, ocr.cardType, ocr.cardLast4, `한우해움 ${sessionNo}회차 (수동 ZIP)`, `haewoom::${f}::${path.basename(imgPath)}`, rel, mime],
            });
          }
          created++;
          console.log(`      ✓ ${category} ${total.toLocaleString()}원 (${ocr.vendorName ?? "-"})`);
        } catch (e: any) {
          console.log(`      OCR 실패: ${e.message}`);
        }
      }
    }
  }
  console.log(`\n총 등록: ${created}건`);
}
main().catch(console.error);
