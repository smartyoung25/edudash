/**
 * IMAP를 통해 코디 발신 메일에서 영수증 첨부를 가져와 Google Vision OCR 처리 후
 * expenses 테이블에 draft 지출을 등록합니다.
 *
 * 환경변수: IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASSWORD
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type Attachment } from "mailparser";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { ocrReceipt, isTaxiReceipt, isRideHailVendor } from "./ocr";
import { downloadDriveFile, uploadDocumentToDrive } from "./drive";
import { pickNearestSessionNo, AUTO_SESSION_CATEGORIES } from "@/lib/expense";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import fs from "fs";
import path from "path";
import { EXTRA_COORDINATOR_EMAILS, EXTRA_EMAIL_TO_MATCH } from "./coordinator-overrides";
import { extractHwpImagesFromBuffer } from "./hwp";
import { PDFDocument } from "pdf-lib";

const RECEIPTS_DIR = "data/receipts";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function guessImageMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

function pickExt(name: string): string {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g|bmp)(?=::|$)/);
  return m ? `.${m[1]}` : ".bin";
}

interface ImportSummary {
  ok: boolean;
  message: string;
  mailsScanned: number;
  attachmentsProcessed: number;
  expensesCreated: number;
  skippedDuplicate: number;
  errors: string[];
}

const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png"];
const ZIP_EXT = [".zip"];
const HWPX_EXT = [".hwpx"];
const HWP_EXT = [".hwp"];
const MAX_SIZE = 30 * 1024 * 1024;
const RECEIPT_KEYWORDS = /(공급가|부가세|합계|영수증|승인금액|판매금|사업자|등록번호|결제\s*금액)/;

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

function getMimeForOcr(contentType?: string): string | undefined {
  if (contentType?.startsWith("application/pdf")) return "application/pdf";
  return undefined;
}

/** HWP (구형 OLE) 파일에서 BinData 이미지 추출 — 순수 JS(cfb + zlib), Vercel 호환 */
export function extractHwpImages(hwpBuf: Buffer, label: string): { name: string; buf: Buffer }[] {
  try {
    return extractHwpImagesFromBuffer(hwpBuf, label);
  } catch {
    return [];
  }
}

/**
 * 여러 페이지 PDF 후보를 페이지별 단일 PDF 후보로 분리.
 * 수당지급확인서처럼 한 PDF에 여러 명(페이지당 1명)이 들어있는 경우, 페이지마다 1건씩
 * OCR·등록되도록 한다. 단일 페이지 PDF·비PDF 후보는 그대로 유지.
 * (중복키는 후보명 기준이므로 페이지마다 `#p{n}` 을 붙여 구분)
 */
export async function expandPdfCandidates(
  cands: { name: string; buf: Buffer; mime?: string }[],
): Promise<{ name: string; buf: Buffer; mime?: string }[]> {
  const out: { name: string; buf: Buffer; mime?: string }[] = [];
  for (const c of cands) {
    const isPdf = c.mime === "application/pdf" || c.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { out.push(c); continue; }
    try {
      const src = await PDFDocument.load(c.buf, { ignoreEncryption: true });
      const n = src.getPageCount();
      if (n <= 1) { out.push({ ...c, mime: "application/pdf" }); continue; }
      for (let i = 0; i < n; i++) {
        const doc = await PDFDocument.create();
        const [pg] = await doc.copyPages(src, [i]);
        doc.addPage(pg);
        const bytes = await doc.save();
        out.push({ name: `${c.name}#p${i + 1}`, buf: Buffer.from(bytes), mime: "application/pdf" });
      }
    } catch {
      out.push(c); // 분리 실패 시 원본 그대로
    }
  }
  return out;
}

const RECEIPTISH_RE = /(경비|지출|품의|영수|식대|식비|재료|출장|결의|수당|청구|강사비)/;
const NON_RECEIPT_RE = /(출석부|등록카드|개인정보)/;

/** ZIP 엔트리명 디코딩 — UTF-8 우선, 깨지면 CP949(한글 zip) 폴백 */
function decodeZipName(e: AdmZip.IZipEntry): string {
  const raw = (e as unknown as { rawEntryName?: Buffer }).rawEntryName;
  if (raw && raw.length) {
    const utf8 = raw.toString("utf8");
    if (!utf8.includes("�")) return utf8;
    try { return iconv.decode(raw, "cp949"); } catch { /* fall through */ }
  }
  return e.entryName;
}

/** ZIP/HWPX 내부의 이미지·PDF(영수증 후보) 추출 — 한글 파일명(CP949) 대응 */
export function extractEmbeddedImages(buf: Buffer, filename: string): { name: string; buf: Buffer }[] {
  const out: { name: string; buf: Buffer }[] = [];
  const lower = filename.toLowerCase();
  // 컨테이너(zip) 파일명 자체가 영수증류면, 내부 HWP/HWPX 엔트리명이 애매해도 추출 허용
  const containerReceiptish = RECEIPTISH_RE.test(filename);
  try {
    if (lower.endsWith(".zip")) {
      const zip = new AdmZip(buf);
      for (const e of zip.getEntries()) {
        if (e.isDirectory) continue;
        const decoded = decodeZipName(e);
        const base = decoded.split(/[\\/]/).pop() ?? decoded;
        const innerLower = decoded.toLowerCase();
        // ZIP 안의 직접 PDF/이미지
        if (/\.(pdf|jpe?g|png)$/i.test(innerLower)) {
          // 출석부, 교육생등록카드는 영수증 아님 — 파일명(폴더 제외)으로 판별
          if (NON_RECEIPT_RE.test(base)) continue;
          out.push({ name: `${filename}::${base}`, buf: e.getData() });
        }
        // ZIP 안의 HWPX (재귀)
        else if (innerLower.endsWith(".hwpx")) {
          if (!containerReceiptish && !RECEIPTISH_RE.test(base)) continue;
          const inner = extractEmbeddedImages(e.getData(), base);
          for (const i of inner) out.push({ name: `${filename}::${base}::${i.name.split("::").pop()}`, buf: i.buf });
        }
        // ZIP 안의 HWP (구형 OLE)
        else if (innerLower.endsWith(".hwp")) {
          if (!containerReceiptish && !RECEIPTISH_RE.test(base)) continue;
          const hwpImgs = extractHwpImages(e.getData(), base);
          for (const i of hwpImgs) out.push({ name: `${filename}::${i.name}`, buf: i.buf });
        }
      }
    } else if (lower.endsWith(".hwpx")) {
      // HWPX = ZIP — BinData 폴더 이미지 모두
      const zip = new AdmZip(buf);
      for (const e of zip.getEntries()) {
        if (e.isDirectory) continue;
        if (/^PrvImage/i.test(e.name)) continue;
        if (/\.(jpe?g|png|bmp)$/i.test(e.entryName) && (e.header.size > 5000)) {
          out.push({ name: e.entryName, buf: e.getData() });
        }
      }
    }
  } catch {
    // 무시
  }
  return out;
}

// ZIP 내부에서 "서류"로 등록할 문서 파일.
//  - 문서 확장자(pdf/hwp/hwpx/xlsx/docx)는 항상 문서로 취급.
//  - 이미지(jpg/png)는 영수증일 확률이 높아 제외하되, 파일명이 서류유형을 명시하면(출석부·일지·등록카드 등) 문서로 포함.
const DOC_INNER_RE = /\.(pdf|hwp|hwpx|xlsx|docx)$/i;
const DOC_IMG_RE = /\.(jpe?g|png)$/i;
const DOC_NAME_RE = /(출석부|코디일지|코디\s*일지|교육생일지|학습일지|운영일지|교육일지|등록카드)/;

/**
 * ZIP 컨테이너 내부의 문서 파일(출석부·코디일지·교육생일지·강사비·정산 등)을 추출.
 * 영수증 추출(extractEmbeddedImages)과 별개로, 묶음 ZIP 안의 문서들이 documents 행으로
 * 수집되도록 한다. 한글 파일명(CP949) 대응.
 */
export function extractEmbeddedDocuments(buf: Buffer, containerName: string): { name: string; buf: Buffer }[] {
  const out: { name: string; buf: Buffer }[] = [];
  if (!containerName.toLowerCase().endsWith(".zip")) return out;
  try {
    const zip = new AdmZip(buf);
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const decoded = decodeZipName(e);
      if (decoded.includes("__MACOSX")) continue;
      const base = decoded.split(/[\\/]/).pop() ?? decoded;
      if (!base || base.startsWith(".")) continue; // 숨김/시스템 파일
      const isDocFile = DOC_INNER_RE.test(base);
      const isDocImage = DOC_IMG_RE.test(base) && DOC_NAME_RE.test(base); // 출석부 등 서류 이미지만
      if (!isDocFile && !isDocImage) continue;
      if ((e.header?.size ?? 0) < 1000) continue; // 빈/잡파일
      out.push({ name: base, buf: e.getData() });
    }
  } catch {
    // 무시 — 손상 ZIP 등
  }
  return out;
}

/** 메일 본문/제목에서 N회차 추출 */
export function detectSessionNo(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*(?:회\s*차|차\s*시)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 발신자 → 담당 팀 결정. 코디가 여러 팀 담당 시 본문/제목 키워드로 disambig */
async function pickTeam(fromAddress: string, subject: string, body: string): Promise<number | null> {
  const teams = await db.select().from(schema.teams);
  // coordinator_email 매칭되는 팀들
  const matched = teams.filter(
    (t) => t.coordinatorEmail && t.coordinatorEmail.toLowerCase() === fromAddress.toLowerCase()
  );
  if (matched.length === 0) {
    // DB coordinatorEmail 미설정 보강 — 코드 override(작목/이름 일부)로 팀 매칭.
    // 매칭 결과가 팀 1개로 유일할 때만 사용(오분류 방지).
    const m = EXTRA_EMAIL_TO_MATCH[fromAddress.toLowerCase()];
    if (m) {
      const byOverride = teams.filter(
        (t) =>
          (!m.product || t.product === m.product) &&
          (!m.nameIncludes || (t.name ?? "").includes(m.nameIncludes))
      );
      if (byOverride.length === 1) return byOverride[0].id;
    }
    return null;
  }
  if (matched.length === 1) return matched[0].id;

  // 여러 팀 — 키워드로 좁히기
  const hay = (subject + " " + body).toLowerCase();
  // 팀명/코호트 키워드로 가장 잘 맞는 팀 고르기
  const ranked = matched
    .map((t) => {
      let score = 0;
      const keys = [t.name, t.cohort, t.product, t.region].filter(Boolean).map((s) => String(s).toLowerCase());
      for (const k of keys) if (k && hay.includes(k)) score += k.length;
      // 단순 product 매칭 (한우/감귤/딸기 등)
      if (hay.includes(t.product.toLowerCase())) score += 2;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);
  if (ranked[0].score > 0) return ranked[0].t.id;
  return matched[0].id; // fallback
}

import { classifyExpense, type ExpenseCategory } from "./expense-classifier";

/** OCR 결과에서 카테고리 추정 — 공유 분류기 호출 (강사비 카테고리는 임포트 흐름에선 별도 처리되지 않으므로 식대 등으로 강등 없이 그대로 전달) */
function guessCategory(
  text: string,
  vendorName: string | null,
  spentTime: string | null
): ExpenseCategory {
  return classifyExpense({ text, vendorName, spentTime }).category;
}

export interface ReceiptContext {
  teamId: number;
  fromAddr: string;
  subject: string;
  messageId: string;
  receivedAt: string;          // ISO
  subjectSession: number | null;
  teams: { id: number; name: string }[];
  /** 지정 시 OCR 카테고리와 무관하게 기관정산(agency)으로 강제, 해당 kind 로 등록 */
  forceAgencyKind?: "출장비" | "기타경비";
}

// OCR 카테고리 → 기관경비 세부분류(subcategory) 매핑
function toAgencySubcategory(category: string): "일비" | "식비" | "교통비" | "숙박비" | "다과비" | "택시비" | "기타" {
  switch (category) {
    case "식대": return "식비";
    case "교통비": return "교통비";
    case "숙박": return "숙박비";
    case "다과": return "다과비";
    default: return "기타";
  }
}

export type ReceiptOutcome =
  | { status: "created"; detail: string }
  | { status: "duplicate" }
  | { status: "skipped"; detail: string }
  | { status: "error"; detail: string };

/**
 * 영수증 후보 1건을 OCR → 파싱 → 카테고리/팀 override → 출장비=기관 라우팅 →
 * 회차 배정 → 중복체크 → expenses/agencyExpenses 등록.
 * 서류 수집(gmail)·영수증 임포트(imap) 양쪽에서 공용으로 사용.
 */
export async function processReceiptCandidate(
  cand: { name: string; buf: Buffer; mime?: string },
  ctx: ReceiptContext
): Promise<ReceiptOutcome> {
  const { teamId, fromAddr, subject, messageId, receivedAt, subjectSession, teams, forceAgencyKind } = ctx;
  const dedupKey = `mail:${messageId}:${cand.name}`;

  // 중복 확인 — 팀 경비는 expenses(message-id+파일명), 기관경비는 dedupKey
  if (forceAgencyKind) {
    const dup = await db
      .select({ id: schema.agencyExpenses.id })
      .from(schema.agencyExpenses)
      .where(eq(schema.agencyExpenses.dedupKey, dedupKey))
      .limit(1);
    if (dup.length > 0) return { status: "duplicate" };
  } else {
    const existing = await db
      .select()
      .from(schema.expenses)
      .where(and(eq(schema.expenses.mailMessageId, messageId), eq(schema.expenses.attachmentName, cand.name)))
      .limit(1);
    if (existing.length > 0) return { status: "duplicate" };
  }

  try {
    const ocr = await ocrReceipt(cand.buf, cand.mime);
    if (!RECEIPT_KEYWORDS.test(ocr.rawText)) return { status: "skipped", detail: "영수증 키워드 없음" };
    // 합계 라벨을 못 찾고 추정으로 금액을 잡은 경우 → 메모에 검토 표시
    const reviewMark = ocr.amountFromFallback ? "⚠금액확인 " : "";

    const _taxi = isTaxiReceipt(ocr.rawText) || isRideHailVendor(ocr.vendorName);
    const supply = _taxi ? (ocr.totalAmount ?? ocr.supplyAmount ?? 0) : (ocr.supplyAmount ?? 0);
    const vat = _taxi ? 0 : (ocr.vatAmount ?? 0);
    const total = ocr.totalAmount ?? supply + vat;
    if (total <= 0) return { status: "skipped", detail: "금액 없음" };
    if (total > 100_000_000) return { status: "skipped", detail: "금액 과다(사업자번호 오인식 가능)" };

    const category = guessCategory(ocr.rawText, ocr.vendorName, ocr.spentTime);
    const spent = ocr.spentDate ?? receivedAt.slice(0, 10);

    // 팀별 카테고리 override (강제 기관경비일 땐 적용 안 함)
    let effectiveCategory: typeof category = category;
    if (!forceAgencyKind) {
      // 숙박 예산이 없는 팀(16:딸기17육묘, 17:딸기16산청청년, 22:딸기11장성) — 숙박 → 출장비(기관)
      const TEAMS_NO_LODGING: number[] = [16, 17, 22];
      if (category === "숙박" && TEAMS_NO_LODGING.includes(teamId)) effectiveCategory = "출장비";
      // 한우7기(team 29) + 카페오늘 — 20만원 정액=임차비, 그 외=다과
      if (teamId === 29 && ocr.vendorName && /카페오늘/.test(ocr.vendorName)) {
        effectiveCategory = total === 200000 ? "임차비" : "다과";
      }
    }

    const isAgencyTravel = !!forceAgencyKind || effectiveCategory === "출장비";
    const subDir = isAgencyTravel ? "agency-travel" : String(teamId);
    const ext = pickExt(cand.name);
    const safeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const relPath = path.join(RECEIPTS_DIR, subDir, `${safeId}${ext}`);
    const mimeType = cand.mime || guessImageMime(cand.name);

    // 로컬 캐시 저장 (읽기전용 FS 환경에서는 best-effort)
    try {
      ensureDir(path.join(RECEIPTS_DIR, subDir));
      fs.writeFileSync(relPath, cand.buf);
    } catch {}

    // Drive 업로드 — 배포 환경에서도 영수증 이미지 조회 가능
    const driveTeamName = isAgencyTravel ? "기관경비" : (teams.find((t) => t.id === teamId)?.name ?? null);
    const driveMonth = Number(spent.slice(5, 7)) || null;
    const up = await uploadDocumentToDrive({
      teamName: driveTeamName,
      docType: isAgencyTravel ? "출장비영수증" : "경비영수증",
      month: driveMonth,
      fileName: `receipt_${safeId}${ext}`,
      bytes: cand.buf,
    });
    const storedPath = up.ok && up.fileId ? `drive:${up.fileId}` : relPath.replace(/\\/g, "/");

    if (isAgencyTravel) {
      const kind = forceAgencyKind ?? "출장비";
      await db.insert(schema.agencyExpenses).values({
        kind,
        subcategory: toAgencySubcategory(category),
        spentDate: spent,
        supplyAmount: supply,
        vatAmount: vat,
        totalAmount: total,
        vendorType: ocr.vendorType,
        vendorBizNo: ocr.vendorBizNo,
        vendorName: ocr.vendorName,
        vendorCeo: ocr.vendorCeo,
        cardType: ocr.cardType,
        cardLast4: ocr.cardLast4,
        memo: `${reviewMark}메일 자동 수집 — ${subject.slice(0, 40)} (from ${fromAddr})`,
        receiptFilePath: storedPath,
        receiptMimeType: mimeType,
        dedupKey,
      });
      return { status: "created", detail: `기관정산(${kind})` };
    }

    // 교차출처 중복 방지 — 같은 팀·일자·금액의 지출이 이미 있으면(수동 등록/이전 수집 등) 스킵.
    // mailMessageId 기반 중복체크만으로는 다른 경로(수동)로 먼저 들어온 동일 건을 못 거른다.
    // 단, 강사비·퍼실리테이터비용은 하루에 강사 2~3명이 같은 금액일 수 있으므로 금액기준 스킵을
    // 적용하지 않는다(여러 강사 수당 누락 방지). 첨부파일 단위 중복(mailMessageId+attachmentName)으로만 거른다.
    const MULTI_PERSON_CATS = new Set(["강사비", "퍼실리테이터비용"]);
    if (!MULTI_PERSON_CATS.has(category)) {
      const sameExpense = await db
        .select({ id: schema.expenses.id })
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.teamId, teamId),
            eq(schema.expenses.spentDate, spent),
            eq(schema.expenses.totalAmount, total),
          ),
        )
        .limit(1);
      if (sameExpense.length > 0) return { status: "duplicate" };
    }

    let autoSessionNo: number | null = subjectSession;
    if (autoSessionNo == null && AUTO_SESSION_CATEGORIES.has(category)) {
      const teamSessions = await db
        .select({ sessionNo: schema.sessions.sessionNo, scheduledDate: schema.sessions.scheduledDate })
        .from(schema.sessions)
        .where(eq(schema.sessions.teamId, teamId));
      autoSessionNo = pickNearestSessionNo(spent, teamSessions);
    }
    await db.insert(schema.expenses).values({
      teamId,
      sessionNo: autoSessionNo,
      spentDate: spent,
      category,
      supplyAmount: supply,
      vatAmount: vat,
      totalAmount: total,
      vendorType: ocr.vendorType,
      vendorBizNo: ocr.vendorBizNo,
      vendorName: ocr.vendorName,
      vendorCeo: ocr.vendorCeo,
      cardType: ocr.cardType,
      cardLast4: ocr.cardLast4,
      memo: `${reviewMark}메일 자동 수집 — ${subject.slice(0, 50)}`,
      source: "mail",
      mailMessageId: messageId,
      mailFrom: fromAddr,
      mailReceivedAt: receivedAt,
      attachmentName: cand.name,
      receiptFilePath: storedPath,
      receiptMimeType: mimeType,
    });
    return { status: "created", detail: `팀정산(${category})` };
  } catch (e: any) {
    return { status: "error", detail: e?.message || String(e) };
  }
}

export async function importReceiptsFromMail(opts?: {
  fromEmail?: string;   // 특정 코디 메일만
  sinceDays?: number;   // 기본 90일
}): Promise<ImportSummary> {
  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT) || 993;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  const summary: ImportSummary = {
    ok: false,
    message: "",
    mailsScanned: 0,
    attachmentsProcessed: 0,
    expensesCreated: 0,
    skippedDuplicate: 0,
    errors: [],
  };

  if (!user || !pass) {
    summary.message = "IMAP_USER / IMAP_PASSWORD 미설정";
    return summary;
  }

  const sinceDays = opts?.sinceDays ?? 90;
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);

  // 모든 코디 이메일 목록 (옵션 fromEmail 있으면 그것만)
  const teams = await db.select().from(schema.teams);
  const coordEmails = new Set<string>();
  for (const t of teams) {
    if (t.coordinatorEmail) coordEmails.add(t.coordinatorEmail.toLowerCase());
  }
  for (const e of EXTRA_COORDINATOR_EMAILS) coordEmails.add(e); // 코드 보강 코디 이메일
  const targetFrom = opts?.fromEmail?.toLowerCase();

  const client = new ImapFlow({
    host, port, secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // 검색: 일정 기간 + (옵션) 특정 발신자
      const searchCriteria: any = { since };
      if (targetFrom) searchCriteria.from = targetFrom;

      const uids = await client.search(searchCriteria, { uid: true });
      const candidateUids = uids || [];

      for (const uid of candidateUids) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true }, { uid: true });
          if (!msg) continue;
          const source = (msg as { source?: Buffer }).source;
          if (!source) continue;

          const parsed: ParsedMail = await simpleParser(source);
          const fromAddr = (parsed.from?.value?.[0]?.address ?? "").toLowerCase();
          if (!fromAddr) continue;

          // 코디 이메일만 처리
          if (targetFrom) {
            if (fromAddr !== targetFrom) continue;
          } else {
            if (!coordEmails.has(fromAddr)) continue;
          }

          summary.mailsScanned++;
          const subject = parsed.subject ?? "";
          const text = parsed.text ?? "";
          const messageId = parsed.messageId ?? `uid-${uid}`;
          const receivedAt = new Date(parsed.date ?? msg.internalDate ?? new Date()).toISOString();

          const teamId = await pickTeam(fromAddr, subject, text);
          if (!teamId) continue;

          const subjectSession = detectSessionNo(subject) ?? detectSessionNo(text);

          // 영수증 후보 모으기: 직접 첨부 + ZIP/HWPX/HWP + 본문의 Drive 링크
          const receiptCandidates: { name: string; buf: Buffer; mime?: string }[] = [];

          // 본문에서 Drive 링크 추출 → 자동 다운로드
          const driveFileIds = new Set<string>();
          const bodyForLinks = (parsed.text ?? "") + " " + (parsed.html ?? "");
          for (const m of bodyForLinks.matchAll(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]{20,})/gi)) {
            driveFileIds.add(m[1]);
          }
          for (const fileId of driveFileIds) {
            const dl = await downloadDriveFile(fileId);
            if (!dl.ok) {
              summary.errors.push(`Drive ${fileId}: ${dl.message}`);
              continue;
            }
            const filename = dl.name;
            const lower = filename.toLowerCase();
            const ext = fileExt(filename);
            if (ALLOWED_EXT.includes(ext)) {
              if (/(출석부|등록카드|개인정보)/.test(filename)) continue;
              receiptCandidates.push({ name: `drive::${filename}`, buf: dl.buf, mime: dl.mimeType.startsWith("application/pdf") ? "application/pdf" : undefined });
            } else if (lower.endsWith(".zip") || lower.endsWith(".hwpx")) {
              const inner = extractEmbeddedImages(dl.buf, filename);
              for (const i of inner) receiptCandidates.push({ name: `drive::${filename}::${i.name.split("::").pop()}`, buf: i.buf });
            } else if (lower.endsWith(".hwp")) {
              if (!/(경비|지출|품의|영수|식대|식비|재료|출장|결의)/.test(filename)) continue;
              const inner = extractHwpImages(dl.buf, filename);
              for (const i of inner) receiptCandidates.push({ name: `drive::${filename}::${i.name.split("::").pop()}`, buf: i.buf });
            }
          }

          for (const att of parsed.attachments) {
            const filename = att.filename || "attachment";
            const ext = fileExt(filename);
            if ((att.size ?? 0) > MAX_SIZE) continue;

            if (ALLOWED_EXT.includes(ext)) {
              // 출석부/등록카드는 영수증 아님
              if (/(출석부|등록카드|개인정보)/.test(filename)) continue;
              receiptCandidates.push({ name: filename, buf: att.content as Buffer, mime: getMimeForOcr(att.contentType) });
            } else if (ZIP_EXT.includes(ext) || HWPX_EXT.includes(ext)) {
              const inner = extractEmbeddedImages(att.content as Buffer, filename);
              for (const i of inner) {
                receiptCandidates.push({ name: i.name, buf: i.buf });
              }
            } else if (HWP_EXT.includes(ext)) {
              // 영수증/품의서 관련만
              if (!/(경비|지출|품의|영수|식대|식비|재료|출장|결의)/.test(filename)) continue;
              const inner = extractHwpImages(att.content as Buffer, filename);
              for (const i of inner) {
                receiptCandidates.push({ name: i.name, buf: i.buf });
              }
            }
          }

          // 여러 페이지 PDF(수당지급확인서 등)는 페이지별로 분리해 1인 1건 등록
          const expandedCandidates = await expandPdfCandidates(receiptCandidates);

          for (const cand of expandedCandidates) {
            const outcome = await processReceiptCandidate(cand, {
              teamId, fromAddr, subject, messageId, receivedAt, subjectSession, teams,
            });
            if (outcome.status === "duplicate") {
              summary.skippedDuplicate++;
              continue;
            }
            summary.attachmentsProcessed++;
            if (outcome.status === "created") summary.expensesCreated++;
            else if (outcome.status === "error") summary.errors.push(`${cand.name}: ${outcome.detail}`);
          }
        } catch (e: any) {
          summary.errors.push(`uid ${uid}: ${e?.message || e}`);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    summary.ok = true;
    summary.message = `메일 ${summary.mailsScanned}건 스캔, 첨부 ${summary.attachmentsProcessed}건 처리, 지출 ${summary.expensesCreated}건 등록 (중복 ${summary.skippedDuplicate}건 스킵)`;
    return summary;
  } catch (err: any) {
    try {
      await client.logout();
    } catch {}
    summary.message = err?.message || "IMAP 오류";
    return summary;
  }
}
