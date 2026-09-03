/**
 * Google Cloud Vision OCR - 영수증 인식 + 필드 파싱
 * GOOGLE_VISION_KEY_PATH=./.secrets/sa.json
 */

import { ImageAnnotatorClient } from "@google-cloud/vision";
import { env } from "../env";

let _client: ImageAnnotatorClient | null = null;

// 설정 여부 판정은 env.ts 한 곳에만 둔다 (연동 설정 페이지와 같은 기준을 쓰기 위해)
export { isOcrEnabled } from "../env";

/**
 * Vision(gRPC) 오류를 사용자에게 그대로 보여줄 수 있는 한국어 원인으로 변환한다.
 * code는 gRPC status — 7 PERMISSION_DENIED / 8 RESOURCE_EXHAUSTED / 16 UNAUTHENTICATED
 */
function toOcrError(err: any): Error & { code?: unknown } {
  const code = err?.code;
  const msg = String(err?.message ?? "");
  let text: string;
  if (code === 7 && /billing/i.test(msg)) {
    text = "Google Cloud 결제 계정이 연결되어 있지 않아 OCR을 사용할 수 없습니다. 관리자에게 문의해 주세요.";
  } else if (code === 7) {
    text = "OCR 권한이 없습니다 (Vision API 미사용 설정 또는 서비스계정 권한 부족).";
  } else if (code === 8) {
    text = "OCR 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  } else if (code === 16 || /invalid_grant|unauthorized|credential/i.test(msg)) {
    text = "OCR 자격증명이 올바르지 않습니다.";
  } else {
    text = msg || "OCR 처리 실패";
  }
  const e = new Error(text) as Error & { code?: unknown; cause?: unknown };
  e.code = code;
  e.cause = err;
  return e;
}

function getClient(): ImageAnnotatorClient {
  if (_client) return _client;

  // 1) 키파일이 실제 디스크에 있으면 사용 (로컬 개발)
  const keyFile = process.env.GOOGLE_VISION_KEY_PATH;
  if (keyFile) {
    try {
      const fs = require("fs") as typeof import("fs");
      if (fs.existsSync(keyFile)) {
        _client = new ImageAnnotatorClient({ keyFilename: keyFile });
        return _client;
      }
    } catch {}
  }

  // 2) 서비스계정 JSON 으로 인증 (Vercel 등 서버리스 — 파일이 배포되지 않음)
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let parsed: { client_email?: string; private_key?: string; project_id?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OCR 서비스계정 JSON 형식이 올바르지 않습니다 (GOOGLE_SERVICE_ACCOUNT_JSON)");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("OCR 서비스계정 JSON에 client_email/private_key가 없습니다");
    }
    _client = new ImageAnnotatorClient({
      credentials: {
        client_email: parsed.client_email,
        private_key: parsed.private_key.replace(/\\n/g, "\n"),
      },
      projectId: parsed.project_id,
    });
    return _client;
  }

  throw new Error("OCR 자격증명 없음 (GOOGLE_VISION_KEY_PATH 파일 또는 GOOGLE_SERVICE_ACCOUNT_JSON 필요)");
}

/** 이미지/PDF 버퍼에서 텍스트 추출 */
export async function extractText(buffer: Buffer, mimeType?: string): Promise<string> {
  try {
    return await callVision(buffer, mimeType);
  } catch (err: any) {
    // 자격증명 문제면 캐시된 클라이언트를 버려 다음 시도에서 다시 만들도록 한다
    if (err?.code === 16) _client = null;
    throw toOcrError(err);
  }
}

async function callVision(buffer: Buffer, mimeType?: string): Promise<string> {
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
  /** 합계 라벨을 못 찾고 '가장 큰 숫자' 추정으로 금액을 잡은 경우 true → 검토 권장 */
  amountFromFallback?: boolean;
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

// ───────── 금액 후보에서 제외할 라인 패턴 ─────────
// 카드번호·TID·승인번호·전화·계좌·식별번호·바코드 등은 모두 큰 숫자를 포함하지만 금액이 아님.
// 한 줄에 키워드가 있으면 그 줄에선 어떤 숫자도 금액으로 잡지 않음.
const NON_AMOUNT_PATTERNS: RegExp[] = [
  /카\s*드\s*번\s*호/,                                // 카드번호
  /^신\s*용\s*카\s*드(\s|$)/,                           // "신용카드 …"  단독 헤더
  /(\d{4}[-\s*]{1,3}){2,3}\d{0,4}\*?/,                  // 9430-0329-****-790* 식 카드번호 노출
  /\*{4,}[\s-]?\d{2,4}/,                                // ****1234, ****-1234
  /^T\s*I\s*D\s*[:：]/i,                                // TID:2771751
  /가\s*맹\s*점?\s*N?o\.?\s*[:：]?/i,                    // 가맹No / 가맹점번호
  /가\s*맹\s*점?\s*번\s*호/,
  /매\s*장\s*번\s*호/,
  /^승\s*인\s*번\s*호\s*[:：]?/,                         // 승인번호 65682739
  /전\s*표\s*N?o\.?\s*[:：]?/i,                          // 전표No 505-0193
  /POS[\s-]?\d/i,                                       // POS-01, POS 47347
  /거\s*래\s*N?o\.?\s*[:：]?/i,                          // 거래No
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/,                    // 사업자등록번호 333-44-55555 (별도 추출됨)
  /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/,               // 02-1234-5678, 010-...
  /^T\s*e\s*l\s*[:：.]/i,                                // Tel:
  /식\s*별\s*번\s*호/,                                  // 현금영수증 식별번호
  /처\s*리\s*번\s*호/,                                  // 농협처리번호 / 타행처리번호
  /^\d{12,}$/,                                          // 바코드/QR 등 12자리 이상 연속숫자
  /\d{2,4}[-\s]\d{2,4}[-\s]\d{4,8}/,                    // 계좌번호 110-123-456789
  /\b\d{6}\s*[-]\s*\d{7}\b/,                            // 주민등록번호 610423-1953817
  /주\s*민\s*등\s*록\s*번\s*호/,                          // 라벨
  /계\s*좌\s*번\s*호/,                                  // 라벨
  /거\s*스\s*름(\s*돈)?/,                                // 거스름돈 — 현금 거래, 합계 아님
  /잔\s*돈/,                                            // 잔돈
  /받\s*은\s*금\s*액/,                                  // 현금 받은금액(낸 현금) — 합계 아님(거스름돈 발생)
  /(적\s*립|포\s*인\s*트|마\s*일\s*리\s*지|머\s*니)/,      // 적립/포인트/마일리지 — 금액 아님
];

// "수당 지급 확인서" 등 강사비 양식 인식
const ALLOWANCE_FORM_RE = /수\s*당\s*지\s*급\s*확\s*인\s*서|강\s*사\s*수\s*당\s*지\s*급|수당지급|강사비\s*지급/;

function isNonAmountLine(line: string): boolean {
  for (const re of NON_AMOUNT_PATTERNS) if (re.test(line)) return true;
  return false;
}

function parseAmount(line: string): number | null {
  const m = line.match(/([\d,]{3,})\s*(?:원)?/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return isFinite(n) ? n : null;
}

/** 다음 라인까지 보면서 숫자 잡기 — 제외 라인은 건너뜀 */
function findAmountNear(lines: string[], idx: number, excluded: Set<number>): number | null {
  const sameLine = lines[idx];
  // 같은 라인이 제외 대상이면 인접 라인만 본다
  if (!excluded.has(idx)) {
    const afterKeyword = sameLine.replace(/.*?(공급가액|공급가|부가세과세\s*물품가액|과세\s*물품가액|과세\s*대상\s*물품가액|과세대상금액|과세\s*물품|부가\s*가치세|부가세|세액|합\s*계|총\s*액|총\s*합계|받을\s*금액|결제\s*금액|판매\s*금액|승인금액|이체금액|송금금액)\s*[:：]?/, "");
    const m1 = afterKeyword.match(/([\d,]{3,})/);
    if (m1) {
      const n = parseInt(m1[1].replace(/,/g, ""), 10);
      if (isFinite(n) && n >= 100) return n;
    }
  }
  // 다음 2줄에서 숫자 (제외 라인 skip)
  for (let i = idx + 1; i < Math.min(idx + 3, lines.length); i++) {
    if (excluded.has(i)) continue;
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

  // 금액 후보에서 제외할 라인 인덱스 (카드번호·TID·승인번호·전화·계좌·식별번호 등)
  const excludedForAmount = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (isNonAmountLine(lines[i])) excludedForAmount.add(i);
  }

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

  // 이체결과 확인증(NH Bank 등) — "받는 분" 을 거래처명으로
  const isTransferConfirm = /이\s*체\s*결\s*과\s*확\s*인\s*증|이\s*체\s*확\s*인\s*증|이\s*체\s*결\s*과/.test(joined);
  // 이체확인증의 다른 셀 라벨 — 받는 분 다음 라인이 이런 라벨이면 스킵하고 더 뒤 라인 사용
  const TRANSFER_LABEL_RE = /^(수수료|이체금액|송금금액|이체일시|보내는\s*분|전달메시지|처리정보|출금정보|입금정보|입금계좌은행|입금계좌번호|출금계좌번호|농협처리번호|타행처리번호|처리일|영수증|확인증)\s*$/;
  if (isTransferConfirm) {
    for (let i = 0; i < lines.length; i++) {
      const sameLine = lines[i].match(/받\s*는\s*분\s*[:：]\s*(.+?)$/);
      if (sameLine && sameLine[1].trim() && !TRANSFER_LABEL_RE.test(sameLine[1].trim())) {
        vendorName = sameLine[1].trim(); break;
      }
      if (/^받\s*는\s*분\s*[:：]?\s*$/.test(lines[i])) {
        // 다음 4줄 안에서 라벨이 아닌 첫 라인을 vendorName으로
        for (let k = 1; k <= 4 && i + k < lines.length; k++) {
          const cand = lines[i + k].trim();
          if (!cand) continue;
          if (TRANSFER_LABEL_RE.test(cand)) continue;
          if (/^\d[\d,\s]*원?\s*$/.test(cand)) continue; // 금액 라인
          vendorName = cand; break;
        }
        if (vendorName) break;
      }
    }
    // 잘린 괄호 보정: "헥토파이낸셜_(주" → "헥토파이낸셜(주)"
    if (vendorName) {
      vendorName = vendorName.replace(/_+/g, "").trim();
      if (/\(\s*주\s*$/.test(vendorName)) vendorName = vendorName.replace(/\(\s*주\s*$/, "(주)");
    }
  }
  const supplierIdx = lines.findIndex((l) => /^공급자|^공급\s*자\b/.test(l));
  const receiverIdx = lines.findIndex((l) => /^공급\s*받는\s*자|^공급받는자/.test(l));
  const supplierEnd = receiverIdx > supplierIdx ? receiverIdx : lines.length;
  const supplierLines = supplierIdx >= 0 ? lines.slice(supplierIdx, supplierEnd) : lines;

  // 거래처명 키워드 (가맹점명/상호명 등 - 카드사명 제외)
  const VENDOR_LABEL_RE = /(가맹점\s*명?|상\s*호|업\s*체\s*명?|사업장명|판매자\s*상호|판매자\s*명?|법인명)/;
  const CARDISSUER_RE = /(매입사|카드사|발행사|입금사|승인사)/;
  // 상호명으로 잘못 잡히는 영수증 안내문구·라벨 (KICC 안내, 고객용/매출전표 등)
  const VENDOR_NOISE_RE = /(가맹점\s*주소|실제와\s*다른|신고\s*안내|포\s*상|고\s*객\s*용|가맹점\s*용|매\s*출\s*전\s*표|신\s*용\s*카\s*드\s*전\s*표|EasyCheck|KICC)/i;

  for (let i = 0; i < supplierLines.length; i++) {
    const line = supplierLines[i];
    // 같은 줄에 라벨+값 (안내문구 줄은 제외)
    if (!vendorName && VENDOR_LABEL_RE.test(line) && !CARDISSUER_RE.test(line) && !VENDOR_NOISE_RE.test(line)) {
      const v = line.replace(/.*?(가맹점명?|상호|업체명?|사업장명|판매자\s*상호|판매자\s*명?|법인명)\s*[:：]?\s*/, "").trim();
      if (v && v.length >= 2 && v.length < 40 && !/^\d/.test(v) && !/^(NH|IBK|국민|신한|삼성|현대|롯데|BC|비씨|농협)\s*카드/.test(v) && !CARDISSUER_RE.test(v) && !VENDOR_NOISE_RE.test(v)) {
        vendorName = v;
      } else if (!v || v.length < 2) {
        // 다음 줄에 값이 있을 수 있음
        const next = supplierLines[i + 1]?.trim();
        if (next && next.length >= 2 && next.length < 40 && !/^\d/.test(next) && !CARDISSUER_RE.test(next) && !VENDOR_NOISE_RE.test(next) && !/^(NH|IBK|국민|신한|삼성|현대|롯데|BC|비씨|농협)\s*카드/.test(next)) {
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
    else if (VENDOR_NOISE_RE.test(vendorName)) vendorName = null;
    else if (vendorName.length < 2 || vendorName.length > 30) vendorName = null;
  }
  // 폴백 1: 사업자번호 위/아래 1-2줄에서 상호 찾기 (영수증 상단)
  if (!vendorName && bizMatches[0]) {
    const i = bizMatches[0].idx;
    for (const j of [i - 1, i - 2, i + 1]) {
      if (j < 0 || j >= lines.length) continue;
      const l = lines[j].replace(/[\[\]【】]/g, "").trim();
      // 한글/영문/㈜ 등으로 2-20자, "영수증" 같은 헤더 제외
      if (/^[가-힣A-Za-z0-9()㈜·\.\-]{2,25}$/.test(l) && !/(상호|업체|사업|번호|등록|대표|영수증|증\s*명|TAX|INVOICE)/i.test(l) && !VENDOR_NOISE_RE.test(l)) {
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
  let amountFromFallback = false;

  // ───────── 강사비 양식 (수당 지급 확인서, 서식17 등) 별도 처리 ─────────
  // 상단에 [강사비 | 교통비 | 숙박비 | 합계] 4열 표가 있고, 그 아래 값 행에 금액이 들어감.
  // OCR이 보통 "강사비\n교통비\n숙박비\n합계\n900,000\n원\n900,000" 식으로 평탄화함.
  if (ALLOWANCE_FORM_RE.test(joined)) {
    // "합계" 라벨 줄을 찾고, 이후 30줄 내에서 "원" 이 붙은 가장 큰 금액(또는 단독 숫자) 들을 후보로
    const totalIdx = lines.findIndex((l) => /^합\s*계\s*$/.test(l) || /^합\s*계\s*[:：]/.test(l));
    const lectureFeeCandidates: number[] = [];
    const totalCandidates: number[] = [];
    if (totalIdx >= 0) {
      for (let k = totalIdx + 1; k < Math.min(totalIdx + 30, lines.length); k++) {
        if (excludedForAmount.has(k)) continue;
        const matches = [...lines[k].matchAll(/([\d,]{4,})\s*원?/g)];
        for (const m of matches) {
          const n = parseInt(m[1].replace(/,/g, ""), 10);
          if (isFinite(n) && n >= 10000 && n <= 50_000_000) totalCandidates.push(n);
        }
      }
    }
    // 강사비 라벨 줄도 탐색 (강사비만 적힌 경우)
    const lecIdx = lines.findIndex((l) => /^강\s*사\s*(비|료|수\s*당)$/.test(l));
    if (lecIdx >= 0) {
      for (let k = lecIdx + 1; k < Math.min(lecIdx + 10, lines.length); k++) {
        if (excludedForAmount.has(k)) continue;
        const m = lines[k].match(/^([\d,]{4,})\s*원?\s*$/);
        if (m) {
          const n = parseInt(m[1].replace(/,/g, ""), 10);
          if (isFinite(n) && n >= 10000 && n <= 50_000_000) lectureFeeCandidates.push(n);
        }
      }
    }
    if (totalCandidates.length > 0) {
      totalAmount = Math.max(...totalCandidates);
      // 강사비/수당은 면세 (간이과세 아님 — 원천세 별도) → supply=total, vat=0
      supplyAmount = totalAmount;
      vatAmount = 0;
    } else if (lectureFeeCandidates.length > 0) {
      totalAmount = Math.max(...lectureFeeCandidates);
      supplyAmount = totalAmount;
      vatAmount = 0;
    }
  }

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
      supplyAmount = findAmountNear(lines, i, excludedForAmount);
    }
    // 부가세: "부 가 세" 같이 글자 사이 공백도 OK
    if (
      vatAmount === null &&
      (/부\s*가\s*가\s*치\s*세/.test(line) || /부\s*가\s*세(?!\s*과)/.test(line) || /세\s*액/.test(line) || /\bVAT\b/i.test(line)) &&
      !/(영\s*세\s*율|면\s*세)/.test(line)
    ) {
      vatAmount = findAmountNear(lines, i, excludedForAmount);
    }
    // 합계: "합 계", "받을금액", 택시 "요금" 등
    if (
      totalAmount === null &&
      /(합\s*계(\s*금\s*액)?|총\s*액|총\s*합\s*계|받\s*을\s*금\s*액|결\s*제\s*금\s*액|판\s*매\s*금\s*액|승\s*인\s*금\s*액|이\s*체\s*금\s*액|송\s*금\s*금\s*액|^\s*요\s*금\s*[:：]|^\s*요\s*금\s*$)/.test(line) &&
      !/소\s*계/.test(line)
    ) {
      totalAmount = findAmountNear(lines, i, excludedForAmount);
    }
  }

  // 합계 폴백: 두 번째로 큰 숫자가 합계인 경우
  if (!totalAmount) {
    // 폴백: 라벨 매칭 모두 실패 시에만 — 제외 라인(카드번호·TID 등) 제외
    const safeLines = lines.filter((_, i) => !excludedForAmount.has(i));
    const allAmounts = safeLines
      .flatMap((l) => Array.from(l.matchAll(/([\d,]{4,})/g)).map((m) => parseInt(m[1].replace(/,/g, ""), 10)))
      // 합리적 한도 5,000,000원 — 폴백은 모호하므로 더 보수적으로
      .filter((n) => isFinite(n) && n >= 1000 && n < 5_000_000);
    if (allAmounts.length) { totalAmount = Math.max(...allAmounts); amountFromFallback = true; }
  }
  // 최종 안전망: 1억 초과는 오인식으로 보고 폐기
  if (totalAmount !== null && totalAmount >= 100_000_000) {
    totalAmount = null; supplyAmount = null; vatAmount = null;
  }

  if (supplyAmount && vatAmount && !totalAmount) totalAmount = supplyAmount + vatAmount;

  // 택시 영수증은 면세업/간이과세 — 요금 전액이 공급가, 부가세 없음
  const taxiContext = /탑\s*승\s*시\s*간|차\s*량\s*번\s*호|택\s*시|TAXI/i.test(joined);
  if (taxiContext) {
    if (totalAmount) { supplyAmount = totalAmount; vatAmount = 0; }
    else if (supplyAmount) { totalAmount = supplyAmount; vatAmount = 0; }
  } else {
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
  }

  // 일자 — 줄 단위 제외는 안 함 (카드번호 같은 줄에 정상 날짜가 함께 있을 수 있음).
  // 대신 연도 sanity check (2024 ~ today+1) 로 카드번호의 9430·4140 같은 4자리가 연도로 잡히는 것 차단.
  const thisYear = new Date().getFullYear();
  const YEAR_MIN = 2024;
  const YEAR_MAX = thisYear + 1;
  let spentDate: string | null = null;
  outer: for (const line of lines) {
    for (const re of DATE_PATTERNS) {
      // 한 줄에 여러 매치가 있을 수 있어 모두 본다 (카드번호 매치 옆에 정상 날짜가 따로 있는 케이스)
      const all = [...line.matchAll(new RegExp(re, "g"))];
      for (const m of all) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const d = parseInt(m[3], 10);
        if (!isFinite(y) || y < YEAR_MIN || y > YEAR_MAX) continue;
        if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
        spentDate = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        break outer;
      }
    }
  }
  // 2자리 연도 폴백: "거래일시 26/02/26" 같은 케이스
  if (!spentDate) {
    for (const line of lines) {
      const m = line.match(/(?:^|[^\d])(\d{2})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})(?:[^\d]|$)/);
      if (!m) continue;
      const y2 = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      if (y2 < 20 || y2 > 35) continue; // 2020~2035
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      spentDate = `20${String(y2).padStart(2, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
    amountFromFallback,
  };
}

export async function ocrReceipt(buffer: Buffer, mimeType?: string): Promise<ParsedReceipt> {
  const text = await extractText(buffer, mimeType);
  return parseReceipt(text);
}

/**
 * 기차표(KTX·SRT·새마을·무궁화·ITX) 영수증 자동 감지.
 */
export function isTrainReceipt(text: string): boolean {
  if (!text) return false;
  const t = text.replace(/\s+/g, " ");
  let score = 0;
  if (/KORAIL|코레일|한국철도공사/i.test(t)) score += 3;
  if (/\bKTX\b|\bSRT\b|새마을|무궁화|ITX/i.test(t)) score += 3;
  if (/일\s*반\s*실|특\s*실|자유\s*석/.test(t)) score += 2;
  if (/어른\s*\d+매|어린이\s*\d+매/.test(t)) score += 2;
  // 출발역 → 도착역 패턴 (한글역명 + 시간)
  if (/[가-힣]{2,5}\s*\d{1,2}\s*[:：]\s*\d{2}\s*[→\-~]\s*[가-힣]{2,5}\s*\d{1,2}\s*[:：]\s*\d{2}/.test(t)) score += 3;
  if (/할\s*인\s*[:：]/.test(t)) score += 1;
  return score >= 4;
}

/**
 * 택시 영수증 자동 감지.
 * 탑승시간/차량번호/거리(Km)/요금 등 택시 영수증 고유 키워드 + 품목 라인 없음.
 */
/** 호출 택시·MaaS 사업자 (카카오T, 우티, 티머니모빌리티 등) */
const RIDE_HAIL_VENDORS = /(카카오\s*모빌리티|카카오\s*T|티머니\s*모빌리티|우티|UT\b|타다|마카롱\s*택시|i\s*M\s*택시|아이엠\s*택시|온다택시|onda)/i;

export function isTaxiReceipt(text: string): boolean {
  if (!text) return false;
  const t = text.replace(/\s+/g, " ");
  let score = 0;
  if (/탑\s*승\s*시\s*간/.test(t)) score += 3;
  if (/차\s*량\s*번\s*호/.test(t)) score += 2;
  if (/승\s*차\s*[/／]\s*기\s*타/.test(t)) score += 2;
  if (/(\d+(?:\.\d+)?)\s*Km/i.test(t)) score += 2;
  if (/택\s*시|TAXI/i.test(t)) score += 2;
  if (/(전남|서울|경기|부산|대구|인천|광주|대전|울산|세종|강원|충북|충남|전북|경북|경남|제주)\s*\d{1,3}[가-힣]\s*\d{4}/.test(t)) score += 2; // 택시 차량 번호판
  if (RIDE_HAIL_VENDORS.test(t)) score += 4; // 호출 택시 가맹점명
  // 품목/상품명 라인이 있으면 일반 매장
  if (/상\s*품\s*명|품\s*목|단\s*가|수\s*량/.test(t)) score -= 3;
  return score >= 4;
}

/** vendor_name 단독으로 호출 택시 가맹점인지 판별 (OCR raw text 없이도 사용) */
export function isRideHailVendor(vendorName?: string | null): boolean {
  return !!vendorName && RIDE_HAIL_VENDORS.test(vendorName);
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
