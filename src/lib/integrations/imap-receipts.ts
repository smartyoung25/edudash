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
import { ocrReceipt } from "./ocr";
import { downloadDriveFile } from "./drive";
import { pickNearestSessionNo, AUTO_SESSION_CATEGORIES } from "@/lib/expense";
import AdmZip from "adm-zip";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

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

/** HWP (구형 OLE) 파일에서 BinData 이미지 추출 — Python olefile 사용 */
function extractHwpImages(hwpBuf: Buffer, label: string): { name: string; buf: Buffer }[] {
  const pythonPath = process.env.PYTHON_PATH || "C:/Users/IIamHub2/AppData/Local/Python/bin/python.exe";
  if (!fs.existsSync(pythonPath)) return [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hwp-"));
  const tmpFile = path.join(tmpDir, "input.hwp");
  fs.writeFileSync(tmpFile, hwpBuf);
  try {
    const out = execFileSync(pythonPath, [path.join(process.cwd(), "scripts/extract_hwp_images.py"), tmpFile, tmpDir], {
      encoding: "utf-8",
      timeout: 30000,
    });
    const parsed = JSON.parse(out);
    if (!parsed.ok) return [];
    const result: { name: string; buf: Buffer }[] = [];
    for (const img of parsed.images) {
      if (fs.existsSync(img.path)) {
        result.push({ name: `${label}::${img.name}`, buf: fs.readFileSync(img.path) });
      }
    }
    return result;
  } catch {
    return [];
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/** ZIP/HWPX 내부의 이미지(영수증 후보) 추출 */
function extractEmbeddedImages(buf: Buffer, filename: string): { name: string; buf: Buffer }[] {
  const out: { name: string; buf: Buffer }[] = [];
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".zip")) {
      const zip = new AdmZip(buf);
      for (const e of zip.getEntries()) {
        if (e.isDirectory) continue;
        const innerLower = e.entryName.toLowerCase();
        // ZIP 안의 직접 PDF/이미지
        if (/\.(pdf|jpe?g|png)$/i.test(innerLower)) {
          // 출석부, 교육생등록카드는 영수증 아님 — 스킵
          if (/(출석부|등록카드|개인정보)/.test(e.entryName)) continue;
          out.push({ name: `${filename}::${e.entryName}`, buf: e.getData() });
        }
        // ZIP 안의 HWPX (재귀)
        else if (innerLower.endsWith(".hwpx")) {
          if (!/(경비|지출|품의|영수|식대|식비|재료|출장|결의)/.test(e.entryName)) continue;
          const inner = extractEmbeddedImages(e.getData(), e.entryName);
          for (const i of inner) out.push({ name: `${filename}::${e.entryName}::${i.name.split("::").pop()}`, buf: i.buf });
        }
        // ZIP 안의 HWP (구형 OLE)
        else if (innerLower.endsWith(".hwp")) {
          if (!/(경비|지출|품의|영수|식대|식비|재료|출장|결의)/.test(e.entryName)) continue;
          const hwpImgs = extractHwpImages(e.getData(), e.entryName);
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

/** 메일 본문/제목에서 N회차 추출 */
function detectSessionNo(text: string): number | null {
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
  if (matched.length === 0) return null;
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

/** 식당 업종 키워드 (시간과 결합해서 식대 분류) */
const RESTAURANT_RE = /(식당|식사|음식|밥|국밥|구이|찌개|국수|면|한식|중식|일식|양식|뷔페|치킨|버거|돈까스|족발|보쌈|삼겹|갈비|회|초밥|짜장|짬뽕|볶음|덮밥|비빔|김밥|분식|떡볶이|순대|만두|쌀국수|우동|라면|피자|파스타|스테이크|샐러드|맥도날드|롯데리아|버거킹|kfc|bbq|교촌|네네|굽네|훌랄라|푸드|수산|횟집|포차|주점|선술집|장어|꼬치|닭갈비|냉면|곱창|막창|냉면|쌈밥|돼지국밥|설렁탕|곰탕|순두부|콩나물|짜파게티|불고기|찜닭|돼지|소고기|닭|오리|곱|장|샤브)/;

const CAFE_RE = /(카페|커피|coffee|cafe|음료|아이스|아메리카노|라떼|에스프레소|스타벅스|이디야|투썸|메가커피|컴포즈|빽다방|할리스|폴바셋|블루보틀|다과|간식|쿠키|빵|베이커리|디저트|파리바게뜨|뚜레쥬르|샌드위치|토스트|와플|마카롱|케이크|크로플|쥬스|스무디|밀크|티)/;

/** OCR 결과에서 카테고리 추정 (시간보다 키워드 우선) */
function guessCategory(
  text: string,
  vendorName: string | null,
  spentTime: string | null
): "식대" | "다과" | "재료비" | "숙박" | "임차비" | "출장비" | "기타" {
  const hay = (text + " " + (vendorName ?? "")).toLowerCase();
  const hour = spentTime ? parseInt(spentTime.split(":")[0], 10) : null;

  // 1. 항공/교통 → 출장비 (강력 — 시간 무관)
  if (/(항공|airline|asiana|korean\s*air|에어부산|제주항공|진에어|이스타|티웨이|jeju\s*air|kobus|고속버스|시외버스|ktx|srt|기차|티켓|코레일|카카오모빌리티|티머니|t-money|택시|렌터카|렌트카|주유|주유소|gs칼텍스|sk에너지|에쓰오일|s-oil|hyundai oilbank|현대오일뱅크|하이패스|통행료|주차)/i.test(hay)) return "출장비";
  // 2. 숙박 (시간 무관)
  if (/(호텔|숙박|모텔|펜션|리조트|게스트|숙소|민박|콘도|hotel|inn|stay\b|guesthouse)/i.test(hay)) return "숙박";
  // 3. 임차비
  if (/(임차|대여|렌터|차량.*대여|버스대여|렌트|회의실|장소.*대여|공간.*대여)/i.test(hay)) return "임차비";
  // 4. 재료비
  if (/(교재|용품|문구|재료|책|복사|인쇄|문구점|다이소|이마트|코스트코|홈플러스|마트|롯데마트|온누리|사무용품|프린트|토너|잉크)/.test(hay)) return "재료비";
  // 5. 카페/다과
  if (CAFE_RE.test(hay)) return "다과";
  // 6. 식당류
  if (RESTAURANT_RE.test(hay)) return "식대";
  // 7. 시간 기반 fallback — 식사 시간대(아침/점심/저녁)에 결제된 영수증 → 식대
  //    조건: 항공/숙박/마트 등 명확한 다른 업종 키워드 없을 때만
  if (hour !== null) {
    if ((hour >= 7 && hour <= 9) || (hour >= 11 && hour <= 14) || (hour >= 17 && hour <= 21)) {
      return "식대";
    }
  }
  return "기타";
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
          if (!msg?.source) continue;

          const parsed: ParsedMail = await simpleParser(msg.source);
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
          const receivedAt = (parsed.date ?? msg.internalDate ?? new Date()).toISOString();

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

          for (const cand of receiptCandidates) {
            // 중복 확인 (message-id + 첨부파일명)
            const existing = await db
              .select()
              .from(schema.expenses)
              .where(
                and(
                  eq(schema.expenses.mailMessageId, messageId),
                  eq(schema.expenses.attachmentName, cand.name)
                )
              )
              .limit(1);
            if (existing.length > 0) {
              summary.skippedDuplicate++;
              continue;
            }

            summary.attachmentsProcessed++;
            try {
              const ocr = await ocrReceipt(cand.buf, cand.mime);
              // 영수증 키워드 없으면 스킵
              if (!RECEIPT_KEYWORDS.test(ocr.rawText)) continue;
              // 금액 정보가 전혀 없으면 스킵
              const supply = ocr.supplyAmount ?? 0;
              const vat = ocr.vatAmount ?? 0;
              const total = ocr.totalAmount ?? supply + vat;
              if (total <= 0) continue;
              // 비현실적으로 큰 금액(>1억) 차단 — 사업자번호를 잘못 잡았을 가능성
              if (total > 100_000_000) continue;

              const category = guessCategory(ocr.rawText, ocr.vendorName, ocr.spentTime);
              const spent = ocr.spentDate ?? receivedAt.slice(0, 10);

              // 영수증 이미지 파일 저장 (출장비는 기관경비 폴더로)
              // 팀별 카테고리 override 규칙
              let effectiveCategory: typeof category = category;

              // 1) 숙박 예산이 없는 팀 — 숙박 → 출장비(기관경비) 자동 라우팅
              //   16: 딸기17육묘, 17: 딸기16산청청년, 22: 딸기11 장성
              const TEAMS_NO_LODGING: number[] = [16, 17, 22];
              if (category === "숙박" && TEAMS_NO_LODGING.includes(teamId)) {
                effectiveCategory = "출장비";
              }

              // 2) 한우7기(team 29) + 카페오늘 — 20만원 정액=임차비, 그 외=다과
              if (teamId === 29 && ocr.vendorName && /카페오늘/.test(ocr.vendorName)) {
                effectiveCategory = total === 200000 ? "임차비" : "다과";
              }

              const isAgencyTravel = effectiveCategory === "출장비";
              const subDir = isAgencyTravel ? "agency-travel" : String(teamId);
              ensureDir(path.join(RECEIPTS_DIR, subDir));
              const ext = pickExt(cand.name);
              const safeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const relPath = path.join(RECEIPTS_DIR, subDir, `${safeId}${ext}`);
              fs.writeFileSync(relPath, cand.buf);
              const mimeType = cand.mime || guessImageMime(cand.name);

              if (isAgencyTravel) {
                // 출장비 → 기관경비 (agency_expenses)
                await db.insert(schema.agencyExpenses).values({
                  kind: "출장비",
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
                  memo: `메일 자동 수집 — ${subject.slice(0, 40)} (from ${fromAddr})`,
                  receiptFilePath: relPath.replace(/\\/g, "/"),
                  receiptMimeType: mimeType,
                });
              } else {
                let autoSessionNo: number | null = subjectSession;
                if (autoSessionNo == null && AUTO_SESSION_CATEGORIES.has(category)) {
                  const teamSessions = await db.select({ sessionNo: schema.sessions.sessionNo, scheduledDate: schema.sessions.scheduledDate })
                    .from(schema.sessions).where(eq(schema.sessions.teamId, teamId));
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
                  memo: `메일 자동 수집 — ${subject.slice(0, 50)}`,
                  source: "mail",
                  mailMessageId: messageId,
                  mailFrom: fromAddr,
                  mailReceivedAt: receivedAt,
                  attachmentName: cand.name,
                  receiptFilePath: relPath.replace(/\\/g, "/"),
                  receiptMimeType: mimeType,
                });
              }
              summary.expensesCreated++;
            } catch (e: any) {
              summary.errors.push(`${cand.name}: ${e?.message || e}`);
            }
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
