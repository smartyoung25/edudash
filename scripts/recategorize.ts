// 기존 메일 영수증 재OCR + 재카테고리
import "dotenv/config";
import fs from "fs";
import { createClient } from "@libsql/client";
import { ocrReceipt } from "../src/lib/integrations/ocr";

const RESTAURANT_RE = /(식당|식사|음식|밥|국밥|구이|찌개|국수|면|한식|중식|일식|양식|뷔페|치킨|버거|돈까스|족발|보쌈|삼겹|갈비|회|초밥|짜장|짬뽕|볶음|덮밥|비빔|김밥|분식|떡볶이|순대|만두|쌀국수|우동|라면|피자|파스타|스테이크|샐러드|맥도날드|롯데리아|버거킹|kfc|bbq|교촌|네네|굽네|훌랄라|푸드|수산|횟집|포차|주점|선술집|장어|꼬치|닭갈비|냉면|곱창|막창|쌈밥|돼지국밥|설렁탕|곰탕|순두부|콩나물|불고기|찜닭|돼지|소고기|닭|오리|곱|장|샤브)/;
const CAFE_RE = /(카페|커피|coffee|cafe|음료|아이스|아메리카노|라떼|에스프레소|스타벅스|이디야|투썸|메가커피|컴포즈|빽다방|할리스|폴바셋|블루보틀|다과|간식|쿠키|빵|베이커리|디저트|파리바게뜨|뚜레쥬르|샌드위치|토스트|와플|마카롱|케이크|크로플|쥬스|스무디|밀크|티)/;

function guessCategory(text: string, vendorName: string | null, spentTime: string | null) {
  const hay = (text + " " + (vendorName ?? "")).toLowerCase();
  const hour = spentTime ? parseInt(spentTime.split(":")[0], 10) : null;
  // 1. 항공/교통 → 출장비 (강력 — 시간 무관)
  if (/(항공|airline|asiana|korean\s*air|에어부산|제주항공|진에어|이스타|티웨이|jeju\s*air|kobus|고속버스|시외버스|ktx|srt|기차|티켓|코레일|카카오모빌리티|티머니|t-money|택시|렌터카|렌트카|주유|주유소|gs칼텍스|sk에너지|에쓰오일|s-oil|hyundai oilbank|현대오일뱅크|하이패스|통행료|주차)/i.test(hay)) return "출장비";
  // 2. 숙박
  if (/(호텔|숙박|모텔|펜션|리조트|게스트|숙소|민박|콘도|hotel|inn|stay\b|guesthouse)/i.test(hay)) return "숙박";
  // 3. 임차비
  if (/(임차|대여|렌터|차량.*대여|버스대여|렌트|회의실|장소.*대여|공간.*대여)/i.test(hay)) return "임차비";
  // 4. 재료비
  if (/(교재|용품|문구|재료|책|복사|인쇄|문구점|다이소|이마트|코스트코|홈플러스|마트|롯데마트|온누리|사무용품|프린트|토너|잉크)/.test(hay)) return "재료비";
  // 5. 카페
  if (CAFE_RE.test(hay)) return "다과";
  // 6. 식당류
  if (RESTAURANT_RE.test(hay)) return "식대";
  // 7. 시간 fallback
  if (hour !== null) {
    if ((hour >= 7 && hour <= 9) || (hour >= 11 && hour <= 14) || (hour >= 17 && hour <= 21)) {
      return "식대";
    }
  }
  return "기타";
}

async function main() {
  const c = createClient({ url: "file:./data/app.db" });
  const rows = (await c.execute("SELECT id, receipt_file_path, receipt_mime_type, category FROM expenses WHERE source='mail' AND receipt_file_path IS NOT NULL")).rows as any[];
  console.log(`대상 ${rows.length}건`);

  for (const r of rows) {
    if (!fs.existsSync(r.receipt_file_path)) { console.log(`파일 없음: ${r.receipt_file_path}`); continue; }
    const buf = fs.readFileSync(r.receipt_file_path);
    try {
      const parsed = await ocrReceipt(buf, r.receipt_mime_type === "application/pdf" ? "application/pdf" : undefined);
      const cat = guessCategory(parsed.rawText, parsed.vendorName, parsed.spentTime);
      const changed = cat !== r.category;
      // 카드 종류·카드 끝번호도 같이 업데이트
      await c.execute({
        sql: "UPDATE expenses SET category=?, vendor_name=COALESCE(?,vendor_name), card_type=?, card_last4=? WHERE id=?",
        args: [cat, parsed.vendorName, parsed.cardType, parsed.cardLast4, r.id],
      });
      console.log(`id ${r.id}: ${r.category} → ${cat} ${changed ? "✓" : ""} | ${parsed.vendorName ?? "-"} | ${parsed.spentTime ?? "-"} | ${parsed.cardType ?? "현금"} ${parsed.cardLast4 ?? ""}`);
    } catch (e: any) {
      console.log(`id ${r.id}: OCR 실패 ${e.message}`);
    }
  }
}
main().catch(console.error);
