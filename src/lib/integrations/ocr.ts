/**
 * Google Cloud Vision OCR - 영수증 인식 + 필드 파싱
 * GOOGLE_VISION_KEY_PATH=./.secrets/sa.json
 */

import { ImageAnnotatorClient } from "@google-cloud/vision";

let _client: ImageAnnotatorClient | null = null;

export function isOcrEnabled(): boolean {
  return !!process.env.GOOGLE_VISION_KEY_PATH;
}

function getClient(): ImageAnnotatorClient {
  if (_client) return _client;
  const keyFile = process.env.GOOGLE_VISION_KEY_PATH;
  if (!keyFile) throw new Error("GOOGLE_VISION_KEY_PATH 환경변수가 없습니다");
  _client = new ImageAnnotatorClient({ keyFilename: keyFile });
  return _client;
}

/** 이미지/PDF 버퍼에서 텍스트 추출 */
export async function extractText(buffer: Buffer, mimeType?: string): Promise<string> {
  const client = getClient();

  if (mimeType === "application/pdf") {
    const [result] = await client.batchAnnotateFiles({
      requests: [{
        inputConfig: { content: buffer.toString("base64"), mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      }],
    });
    const pages = result.responses?.[0]?.responses ?? [];
    return pages.map((p) => p.fullTextAnnotation?.text ?? "").join("\n");
  }

  const [result] = await client.documentTextDetection({ image: { content: buffer } });
  return result.fullTextAnnotation?.text ?? "";
}

export interface ParsedReceipt {
  vendorName: string | null;
  vendorCeo: string | null;
  vendorBizNo: string | null;        // XXX-XX-XXXXX
  vendorType: "개인사업자" | "법인사업자" | null;
  spentDate: string | null;          // YYYY-MM-DD
  spentTime: string | null;          // HH:MM (24h)
  supplyAmount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  cardType: "기업카드" | "기업법인카드" | "NH법인카드" | "개인카드" | null;
  cardLast4: string | null;
  rawText: string;
}

// NH법인카드 카드번호 (끝 4자리 매칭)
const NH_CARD_LAST4 = new Set(["4283", "8251", "3731", "4259", "4267", "8244", "4275"]);
// 기업법인카드 (IBK 4140-0307-7475-9906)
const IBK_CORP_LAST4 = new Set(["9906"]);

const BIZ_NO_RE = /(\d{3})[-\s]?(\d{2})[-\s]?(\d{5})/;
const DATE_PATTERNS = [
  /(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})/,
  /(\d{4})(\d{2})(\d{2})/,
];

function parseAmount(line: string): number | null {
  const m = line.match(/([\d,]{3,})\s*(?:원)?/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return isFinite(n) ? n : null;
}

/** 다음 라인까지 보면서 숫자 잡기 */
function findAmountNear(lines: string[], idx: number): number | null {
  const sameLine = lines[idx];
  // 같은 라인에서 키워드 뒤의 숫자
  const afterKeyword = sameLine.replace(/.*?(공급가액|공급가|부가세과세\s*물품가액|과세\s*물품가액|과세\s*대상\s*물품가액|과세대상금액|과세\s*물품|부가\s*가치세|부가세|세액|합\s*계|총\s*액|총\s*합계|받을\s*금액|결제\s*금액|판매\s*금액|승인금액)\s*[:：]?/, "");
  const m1 = afterKeyword.match(/([\d,]{3,})/);
  if (m1) {
    const n = parseInt(m1[1].replace(/,/g, ""), 10);
    if (isFinite(n) && n >= 100) return n;
  }
  // 다음 2줄에서 숫자
  for (let i = idx + 1; i < Math.min(idx + 3, lines.length); i++) {
    const m = lines[i].match(/^([\d,]{3,})$/) || lines[i].match(/([\d,]{4,})/);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (isFinite(n) && n >= 100) return n;
    }
  }
  return null;
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = lines.join("\n");

  // 사업자등록번호 — 첫 번째는 공급자, 두 번째는 공급받는자인 경우가 많음
  const bizMatches: { idx: number; value: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(BIZ_NO_RE);
    if (m) bizMatches.push({ idx: i, value: `${m[1]}-${m[2]}-${m[3]}` });
  }
  const vendorBizNo = bizMatches[0]?.value ?? null;

  let vendorType: ParsedReceipt["vendorType"] = null;
  if (vendorBizNo) {
    const mid = parseInt(vendorBizNo.split("-")[1], 10);
    vendorType = mid >= 81 && mid <= 88 ? "법인사업자" : "개인사업자";
  }

  // 거래처명·대표자 — "공급자" 섹션 우선
  let vendorName: string | null = null;
  let vendorCeo: string | null = null;
  const supplierIdx = lines.findIndex((l) => /^공급자|^공급\s*자\b/.test(l));
  const receiverIdx = lines.findIndex((l) => /^공급\s*받는\s*자|^공급받는자/.test(l));
  const supplierEnd = receiverIdx > supplierIdx ? receiverIdx : lines.length;
  const supplierLines = supplierIdx >= 0 ? lines.slice(supplierIdx, supplierEnd) : lines;

  // 거래처명 키워드 (가맹점명/상호명 등 - 카드사명 제외)
  const VENDOR_LABEL_RE = /(가맹점\s*명?|상\s*호|업\s*체\s*명?|사업장명|판매자\s*상호|판매자\s*명?|법인명)/;
  const CARDISSUER_RE = /(매입사|카드사|발행사|입금사|승인사)/;

  for (let i = 0; i < supplierLines.length; i++) {
    const line = supplierLines[i];
    // 같은 줄에 라벨+값
    if (!vendorName && VENDOR_LABEL_RE.test(line) && !CARDISSUER_RE.test(line)) {
      const v = line.replace(/.*?(가맹점명?|상호|업체명?|사업장명|판매자\s*상호|판매자\s*명?|법인명)\s*[:：]?\s*/, "").trim();
      if (v && v.length >= 2 && v.length < 40 && !/^\d/.test(v) && !/^(NH|IBK|국민|신한|삼성|현대|롯데|BC|비씨|농협)\s*카드/.test(v) && !CARDISSUER_RE.test(v)) {
        vendorName = v;
      } else if (!v || v.length < 2) {
        // 다음 줄에 값이 있을 수 있음
        const next = supplierLines[i + 1]?.trim();
        if (next && next.length >= 2 && next.length < 40 && !/^\d/.test(next) && !CARDISSUER_RE.test(next) && !/^(NH|IBK|국민|신한|삼성|현대|롯데|BC|비씨|농협)\s*카드/.test(next)) {
          vendorName = next;
        }
      }
    }
    if (!vendorCeo && /(대\s*표(자|자명|이사)?|성\s*명)/.test(line) && !/대표\s*전화|대표\s*번호/.test(line)) {
      const v = line.replace(/.*?(대표(자|자명|이사)?|성명)\s*[:：]?\s*/, "").trim();
      if (v && v.length < 15) vendorCeo = v;
    }
  }

  // 추가 정제: vendorName이 노이즈면 무시
  if (vendorName) {
    const BAD = [
      CARDISSUER_RE,
      /(NH|IBK|BC|비씨)\s*카드/,
      /^[크크,.\s]+/,
      /^정보$/,
      /^번호\s*[:：]/,
      /^[\d\-]{5,}$/,
      /^최종\s*변경/,
      /\b\d{4}\.\d{2}\.\d{2}\b/,
      /^신용\s*거래/,
      /^주\s*소/,
      /^전화|^TEL|^FAX/i,
      /^http|^www/i,
      /^\s*$/,
      /^판매자/,
      /^상품명/,
      /^한국G$/,
      /^(영수증|TAX|INVOICE|일반|VAT|매출전표|승인|결제)/i,
      /^[A-Z]\s*$/,
    ];
    if (BAD.some((re) => re.test(vendorName!))) vendorName = null;
    else if (vendorName.length < 2 || vendorName.length > 30) vendorName = null;
  }
  // 폴백 1: 사업자번호 위/아래 1-2줄에서 상호 찾기 (영수증 상단)
  if (!vendorName && bizMatches[0]) {
    const i = bizMatches[0].idx;
    for (const j of [i - 1, i - 2, i + 1]) {
      if (j < 0 || j >= lines.length) continue;
      const l = lines[j].replace(/[\[\]【】]/g, "").trim();
      // 한글/영문/㈜ 등으로 2-20자, "영수증" 같은 헤더 제외
      if (/^[가-힣A-Za-z0-9()㈜·\.\-]{2,25}$/.test(l) && !/(상호|업체|사업|번호|등록|대표|영수증|증\s*명|TAX|INVOICE)/i.test(l)) {
        vendorName = l;
        break;
      }
    }
  }

  // 폴백 2: 대표자명 — 사업자번호와 같은 줄/근처 줄 끝에 2-4자 한글 이름
  if (!vendorCeo && bizMatches[0]) {
    const i = bizMatches[0].idx;
    for (const j of [i, i + 1, i - 1]) {
      if (j < 0 || j >= lines.length) continue;
      // 줄 끝 또는 공백 뒤에 한글 2-4자 이름
      const m = lines[j].match(/(?:^|\s|TEL[:：]?[\d\-]+\s*|FAX[:：]?[\d\-]+\s*)([가-힣]{2,4})\s*$/);
      if (m && !/(원|업|점|관|서|구|동|호|층|로|길)$/.test(m[1])) {
        vendorCeo = m[1];
        break;
      }
    }
  }

  // 금액 — 키워드 발견 시 같은/다음 라인에서 숫자 찾기
  let supplyAmount: number | null = null;
  let vatAmount: number | null = null;
  let totalAmount: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 공급가액 변형 — 모든 키워드에 \s* 허용 (OCR에서 띄어쓰기 들어가는 케이스)
    if (
      supplyAmount === null &&
      (/공\s*급\s*가(\s*액)?/.test(line) ||
        /부\s*가\s*세\s*과\s*세\s*물\s*품\s*가\s*액/.test(line) ||
        /과\s*세\s*물\s*품\s*가\s*액/.test(line) ||
        /과\s*세\s*대\s*상\s*(물\s*품)?\s*가?\s*액/.test(line) ||
        /과\s*세\s*대\s*상\s*금\s*액/.test(line)) &&
      !/면\s*세/.test(line)
    ) {
      supplyAmount = findAmountNear(lines, i);
    }
    // 부가세: "부 가 세" 같이 글자 사이 공백도 OK
    if (
      vatAmount === null &&
      (/부\s*가\s*가\s*치\s*세/.test(line) || /부\s*가\s*세(?!\s*과)/.test(line) || /세\s*액/.test(line) || /\bVAT\b/i.test(line)) &&
      !/(영\s*세\s*율|면\s*세)/.test(line)
    ) {
      vatAmount = findAmountNear(lines, i);
    }
    // 합계: "합 계", "받을금액" 등
    if (
      totalAmount === null &&
      /(합\s*계(\s*금\s*액)?|총\s*액|총\s*합\s*계|받\s*을\s*금\s*액|받\s*은\s*금\s*액|결\s*제\s*금\s*액|판\s*매\s*금\s*액|승\s*인\s*금\s*액)/.test(line) &&
      !/소\s*계/.test(line)
    ) {
      totalAmount = findAmountNear(lines, i);
    }
  }

  // 합계 폴백: 두 번째로 큰 숫자가 합계인 경우
  if (!totalAmount) {
    const allAmounts = lines.flatMap((l) => Array.from(l.matchAll(/([\d,]{4,})/g)).map((m) => parseInt(m[1].replace(/,/g, ""), 10)))
      .filter((n) => isFinite(n) && n >= 1000 && n < 100_000_000);
    if (allAmounts.length) totalAmount = Math.max(...allAmounts);
  }

  if (supplyAmount && vatAmount && !totalAmount) totalAmount = supplyAmount + vatAmount;
  if (totalAmount && !supplyAmount && !vatAmount) {
    const s = Math.round(totalAmount / 1.1);
    supplyAmount = s;
    vatAmount = totalAmount - s;
  }
  // 공급가만 빠진 경우: 합계 - 부가세
  if (!supplyAmount && vatAmount && totalAmount && totalAmount > vatAmount) {
    supplyAmount = totalAmount - vatAmount;
  }
  // 부가세만 빠진 경우: 합계 - 공급가
  if (supplyAmount && !vatAmount && totalAmount && totalAmount > supplyAmount) {
    vatAmount = totalAmount - supplyAmount;
  }
  // 부가세=합계 이상한 케이스: 부가세가 사실은 합계인 경우 (총액에서 1/11 역산)
  if (!supplyAmount && vatAmount && totalAmount && totalAmount === vatAmount) {
    const s = Math.round(totalAmount / 1.1);
    supplyAmount = s;
    vatAmount = totalAmount - s;
  }

  // 일자
  let spentDate: string | null = null;
  for (const re of DATE_PATTERNS) {
    const m = joined.match(re);
    if (m) {
      const y = m[1], mo = String(m[2]).padStart(2, "0"), d = String(m[3]).padStart(2, "0");
      spentDate = `${y}-${mo}-${d}`;
      break;
    }
  }

  // 시간 (HH:MM) — 영수증 결제 시간
  let spentTime: string | null = null;
  const timeMatch = joined.match(/(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*\d{2})?/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min < 60) {
      spentTime = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  // 카드 종류 판별: IBK 기업카드(=비씨/BC) → 기업카드, 그 외 → 개인카드
  let cardType: ParsedReceipt["cardType"] = null;
  let cardLast4: string | null = null;
  // 카드번호 끝 4자리 (****-XXXX 또는 ****XXXX 형태)
  const last4Match = joined.match(/(?:[*x×#]{4,}|[*x×#]+-){1,3}\s*[-\s]?\s*(\d{4})\b/i);
  if (last4Match) cardLast4 = last4Match[1];

  // NH 카드번호 풀패턴 (9431-1604-XXXX-XXXX)
  const nhMatch = joined.match(/9431[\s-]*1604[\s-]*(\d{4})[\s-]*(\d{4})/);
  if (nhMatch) {
    const last4 = nhMatch[2];
    if (!cardLast4) cardLast4 = last4;
    cardType = "NH법인카드";
  }
  // IBK 기업법인카드 풀패턴 (4140-0307-7475-9906)
  const ibkCorpMatch = joined.match(/4140[\s-]*0307[\s-]*7475[\s-]*(\d{4})/);
  if (!cardType && ibkCorpMatch) {
    const last4 = ibkCorpMatch[1];
    if (!cardLast4) cardLast4 = last4;
    if (IBK_CORP_LAST4.has(last4)) cardType = "기업법인카드";
  }
  // last4 기반 매칭
  if (!cardType && cardLast4) {
    if (NH_CARD_LAST4.has(cardLast4)) cardType = "NH법인카드";
    else if (IBK_CORP_LAST4.has(cardLast4)) cardType = "기업법인카드";
  }
  // 농협/NH 키워드
  if (!cardType && /(NH\s*법인|농협\s*법인|농협카드|NH카드|NH체크)/i.test(joined)) {
    cardType = "NH법인카드";
  }
  // IBK 기업/비씨 카드 (사업비카드)
  if (!cardType) {
    const hasIBK = /(IBK\s*비씨|IBK\s*기업|IBK\s*BC|IBK카드|기업\s*카드|IBKBC)/i.test(joined);
    if (hasIBK) {
      cardType = "기업카드";
    }
    // 개인카드 default은 제거 — 명확한 단서 없으면 null (사용자가 검토)
  }
  // 현금/계좌이체면 cardType은 null로

  return {
    vendorName: vendorName || null,
    vendorCeo: vendorCeo || null,
    vendorBizNo,
    vendorType,
    spentDate,
    spentTime,
    supplyAmount,
    vatAmount,
    totalAmount,
    cardType,
    cardLast4,
    rawText: text,
  };
}

export async function ocrReceipt(buffer: Buffer, mimeType?: string): Promise<ParsedReceipt> {
  const text = await extractText(buffer, mimeType);
  return parseReceipt(text);
}

// 호환성: 기존 사용처
export interface ExtractedReceipt {
  expenseDate?: string;
  item?: string;
  amount?: number;
  notes?: string;
}
export async function extractReceipt(_fileRef: string): Promise<ExtractedReceipt | null> {
  return null;
}
