/**
 * 영수증 → 계정과목 자동분류 (룰 기반)
 *
 * imap-receipts.ts의 guessCategory를 공유 모듈로 승격하고
 * 신뢰도(confidence)와 매칭 사유(reasons)를 함께 반환한다.
 *
 * 카테고리(=expenses.category enum):
 *   강사비 · 퍼실리테이터비용 · 식대 · 다과 · 재료비 · 숙박 · 임차비 · 출장비 · 기타
 *
 * 신뢰도 가이드라인:
 *   1.00 — 양식/강한 단서 (강사비 양식, 카드사·항공사 등 명시)
 *   0.85 — 일반 키워드 매칭
 *   0.65 — 단일 약한 키워드
 *   0.40 — 시간대 폴백 (식사시간 → 식대)
 *   0.20 — 매칭 없음, 기타로 폴백
 */

export type ExpenseCategory =
  | "강사비"
  | "퍼실리테이터비용"
  | "식대"
  | "다과"
  | "재료비"
  | "숙박"
  | "임차비"
  | "출장비"
  | "기타";

export interface ClassifyResult {
  category: ExpenseCategory;
  confidence: number;       // 0.0 ~ 1.0
  reasons: string[];        // 사람이 읽을 수 있는 매칭 사유 (디버깅·UI 툴팁용)
}

export interface ClassifyInput {
  text?: string | null;             // OCR raw text
  vendorName?: string | null;
  spentTime?: string | null;        // "HH:MM"
}

// ───────── 키워드 패턴 (RESTAURANT_RE / CAFE_RE는 imap-receipts에서 이관) ─────────

const ALLOWANCE_FORM_RE = /수\s*당\s*지\s*급\s*확\s*인\s*서|강\s*사\s*수\s*당\s*지\s*급|수당지급|강사비\s*지급/;
const FACILITATOR_RE = /(퍼실리테이터|퍼실|facilitator|보조강사|서브강사)/i;
const HEAD_LECTURER_RE = /(주임강사|메인강사|책임강사|수석강사)/;

const TRANSPORT_STRONG_RE = /(항공|airline|asiana|korean\s*air|에어부산|제주항공|진에어|이스타|티웨이|jeju\s*air|kobus|고속버스|시외버스|ktx|srt|코레일|카카오모빌리티|티머니|t-money|렌터카|렌트카|주유|주유소|gs칼텍스|sk에너지|에쓰오일|s-oil|hyundai oilbank|현대오일뱅크|하이패스|통행료|주차)/i;
const TAXI_RE = /(택시|TAXI)/i;

const LODGING_RE = /(호텔|숙박|모텔|펜션|리조트|게스트|숙소|민박|콘도|hotel|inn|stay\b|guesthouse)/i;

const RENTAL_RE = /(임차|대여|렌터|차량.*대여|버스대여|렌트|회의실|장소.*대여|공간.*대여|대관)/;

const SUPPLIES_RE = /(교재|용품|문구|재료|책|복사|인쇄|문구점|다이소|이마트|코스트코|홈플러스|마트|롯데마트|온누리|사무용품|프린트|토너|잉크)/;

const CAFE_RE = /(카페|커피|coffee|cafe|음료|아이스|아메리카노|라떼|에스프레소|스타벅스|이디야|투썸|메가커피|컴포즈|빽다방|할리스|폴바셋|블루보틀|다과|간식|쿠키|빵|베이커리|디저트|파리바게뜨|뚜레쥬르|샌드위치|토스트|와플|마카롱|케이크|크로플|쥬스|스무디|밀크|티)/i;

const RESTAURANT_RE = /(식당|식사|음식|밥|국밥|구이|찌개|국수|면|한식|중식|일식|양식|뷔페|치킨|버거|돈까스|족발|보쌈|삼겹|갈비|회|초밥|짜장|짬뽕|볶음|덮밥|비빔|김밥|분식|떡볶이|순대|만두|쌀국수|우동|라면|피자|파스타|스테이크|샐러드|맥도날드|롯데리아|버거킹|kfc|bbq|교촌|네네|굽네|훌랄라|푸드|수산|횟집|포차|주점|선술집|장어|꼬치|닭갈비|냉면|곱창|막창|쌈밥|돼지국밥|설렁탕|곰탕|순두부|콩나물|불고기|찜닭|돼지|소고기|닭|오리|곱|장|샤브)/i;

function meal(spentTime: string | null | undefined): boolean {
  if (!spentTime) return false;
  const h = parseInt(spentTime.split(":")[0], 10);
  if (!isFinite(h)) return false;
  return (h >= 7 && h <= 9) || (h >= 11 && h <= 14) || (h >= 17 && h <= 21);
}

/** 룰 기반 영수증 → 카테고리 분류 */
export function classifyExpense(input: ClassifyInput): ClassifyResult {
  const text = input.text ?? "";
  const vendor = input.vendorName ?? "";
  const hay = (text + " " + vendor).toLowerCase();
  const haystackOriginal = text + " " + vendor;

  const reasons: string[] = [];

  // 1. 강사비 양식 — 가장 강한 단서
  if (ALLOWANCE_FORM_RE.test(haystackOriginal)) {
    if (FACILITATOR_RE.test(haystackOriginal)) {
      reasons.push("'수당지급확인서' + '퍼실리테이터' 키워드");
      return { category: "퍼실리테이터비용", confidence: 1.0, reasons };
    }
    if (HEAD_LECTURER_RE.test(haystackOriginal)) {
      reasons.push("'수당지급확인서' + '주임강사' 키워드");
      return { category: "강사비", confidence: 1.0, reasons };
    }
    reasons.push("'수당지급확인서' 양식 감지 (주임강사로 추정)");
    return { category: "강사비", confidence: 0.85, reasons };
  }

  // 2. 항공/철도/렌터카/주유 — 출장비 강신호
  if (TRANSPORT_STRONG_RE.test(haystackOriginal)) {
    const m = haystackOriginal.match(TRANSPORT_STRONG_RE);
    reasons.push(`교통/주유 키워드: '${m?.[0]}'`);
    return { category: "출장비", confidence: 0.95, reasons };
  }
  if (TAXI_RE.test(haystackOriginal)) {
    reasons.push("택시 키워드");
    return { category: "출장비", confidence: 0.9, reasons };
  }

  // 3. 숙박
  if (LODGING_RE.test(haystackOriginal)) {
    const m = haystackOriginal.match(LODGING_RE);
    reasons.push(`숙박 키워드: '${m?.[0]}'`);
    return { category: "숙박", confidence: 0.9, reasons };
  }

  // 4. 임차비 (장소 대여)
  if (RENTAL_RE.test(haystackOriginal)) {
    const m = haystackOriginal.match(RENTAL_RE);
    reasons.push(`임차 키워드: '${m?.[0]}'`);
    return { category: "임차비", confidence: 0.85, reasons };
  }

  // 5. 재료비 / 사무용품 / 마트
  if (SUPPLIES_RE.test(haystackOriginal)) {
    const m = haystackOriginal.match(SUPPLIES_RE);
    reasons.push(`재료/사무용품 키워드: '${m?.[0]}'`);
    return { category: "재료비", confidence: 0.85, reasons };
  }

  // 6. 카페/다과
  if (CAFE_RE.test(hay)) {
    const m = hay.match(CAFE_RE);
    reasons.push(`카페/다과 키워드: '${m?.[0]}'`);
    return { category: "다과", confidence: 0.85, reasons };
  }

  // 7. 식당
  if (RESTAURANT_RE.test(hay)) {
    const m = hay.match(RESTAURANT_RE);
    reasons.push(`식당 키워드: '${m?.[0]}'`);
    return { category: "식대", confidence: 0.8, reasons };
  }

  // 8. 시간대 폴백 — 식사 시간이면 식대
  if (meal(input.spentTime ?? null)) {
    reasons.push(`결제 시각 ${input.spentTime} 식사시간대`);
    return { category: "식대", confidence: 0.4, reasons };
  }

  reasons.push("매칭 키워드 없음");
  return { category: "기타", confidence: 0.2, reasons };
}

/** 짧은 한글 라벨 — UI 배지/툴팁에 사용 */
export function formatClassification(r: ClassifyResult): string {
  const pct = Math.round(r.confidence * 100);
  return `${r.category} (${pct}%)`;
}
