import { db, schema } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";
import { env, isMailEnabled } from "../env";
import { getGmailClient } from "./google-auth";
import { uploadDocumentToDrive } from "./drive";
import { classifyTeam, classifyTeamByText, classifyDocType, detectMonth, detectSessionNo, resetClassifierCache } from "./classifier";
import {
  processReceiptCandidate,
  detectSessionNo as detectReceiptSessionNo,
  extractEmbeddedImages,
  extractHwpImages,
  extractEmbeddedDocuments,
  expandPdfCandidates,
} from "./imap-receipts";
import { EXTRA_COORDINATOR_EMAILS } from "./coordinator-overrides";
import { isJangseongStrawberry } from "./self-mail-rule";

export interface MailSyncResult {
  ok: boolean;
  message: string;
  newMails?: number;
  newAttachments?: number;
  unclassified?: number;
  expensesCreated?: number;
  alreadyProcessed?: number;
}

const ALLOWED_EXT = [".pdf", ".hwp", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"];
// 영수증 추출용으로 추가로 내려받을 압축/한글 컨테이너 (문서 행은 만들지 않고 내부 영수증만 추출)
const ARCHIVE_EXT = [".zip", ".hwpx"];
// 영수증/수당/품의서류로 보이는 첨부만 정산 반영 대상으로 (출석부·일지 등 제외)
const RECEIPTISH = /(경비|지출|품의|영수|식대|식비|재료|출장|결의|수당|청구|강사비)/;
const MAX_SIZE = 20 * 1024 * 1024;
const MAX_MESSAGES_PER_POLL = 50;

/** 첨부 1건에서 정산 반영용 영수증 후보들을 추출 (직접 PDF/이미지 · ZIP/HWPX · HWP) */
function buildReceiptCandidates(
  ext: string,
  filename: string,
  subject: string,
  bytes: Buffer,
  docType: string,
): { name: string; buf: Buffer; mime?: string }[] {
  if ([".pdf", ".jpg", ".jpeg", ".png"].includes(ext)) {
    const isReceipt =
      docType === "경비영수증" || docType === "강사비지급확인서" || RECEIPTISH.test(filename) || RECEIPTISH.test(subject);
    if (!isReceipt) return [];
    return [{ name: filename, buf: bytes, mime: ext === ".pdf" ? "application/pdf" : undefined }];
  }
  if (!RECEIPTISH.test(filename) && !RECEIPTISH.test(subject)) return [];
  if (ARCHIVE_EXT.includes(ext)) return extractEmbeddedImages(bytes, filename);
  if (ext === ".hwp") return extractHwpImages(bytes, filename);
  return [];
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

function decodeHeader(value: string | undefined): string {
  return value ?? "";
}

function extractAddress(fromHeader: string): string {
  // "Name <addr@host>" or just "addr@host"
  const m = fromHeader.match(/<([^>]+)>/);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

function teamNameLookup(teamId: number | null, teams: { id: number; name: string }[]): string | null {
  if (!teamId) return null;
  return teams.find((t) => t.id === teamId)?.name ?? null;
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

function* walkParts(part: GmailPart | undefined): Generator<GmailPart> {
  if (!part) return;
  yield part;
  if (part.parts) {
    for (const p of part.parts) yield* walkParts(p);
  }
}

export async function pollMailbox(opts?: {
  fromEmail?: string;
  sinceDays?: number;
  includeRead?: boolean;
}): Promise<MailSyncResult> {
  if (!isMailEnabled()) {
    return { ok: false, message: "Gmail 자격증명 미설정 (GOOGLE_SERVICE_ACCOUNT_JSON / GMAIL_USER)" };
  }
  const gmail = getGmailClient();
  if (!gmail) return { ok: false, message: "Gmail client not initialized" };

  const userId = env.GMAIL_USER;
  let newMails = 0;
  let newAttachments = 0;
  let unclassified = 0;
  let expensesCreated = 0;
  let alreadyProcessed = 0;

  // 허용 발신자(코디·교수·앱 사용자 이메일)만 수집 — 사업 무관 메일 과수집 방지.
  // opts.fromEmail 이 지정되면 그 발신자만 보므로 허용목록은 사용하지 않음.
  const allowlist = new Set<string>();
  if (!opts?.fromEmail) {
    const [emailTeams, emailUsers] = await Promise.all([
      db.select({ c: schema.teams.coordinatorEmail, p: schema.teams.professorEmail }).from(schema.teams),
      db.select({ email: schema.users.email }).from(schema.users),
    ]);
    for (const t of emailTeams) {
      if (t.c) allowlist.add(t.c.toLowerCase());
      if (t.p) allowlist.add(t.p.toLowerCase());
    }
    for (const u of emailUsers) if (u.email) allowlist.add(u.email.toLowerCase());
    for (const e of EXTRA_COORDINATOR_EMAILS) allowlist.add(e); // 코드 보강 코디 이메일
  }

  // 쿼리 조립: 기본은 is:unread has:attachment (cron 호환).
  // opts 들어오면 includeRead 가 true 면 is:unread 제거, fromEmail/sinceDays 필터 추가.
  const queryParts: string[] = ["has:attachment"];
  if (!opts?.includeRead) queryParts.unshift("is:unread");
  if (opts?.fromEmail) queryParts.push(`from:${opts.fromEmail}`);
  else if (allowlist.size) queryParts.push(`from:(${[...allowlist].join(" OR ")})`);
  if (opts?.sinceDays) queryParts.push(`newer_than:${opts.sinceDays}d`);
  const q = queryParts.join(" ");
  const skipMarkRead = !!opts?.includeRead;

  try {
    resetClassifierCache();
    const list = await gmail.users.messages.list({
      userId,
      q,
      maxResults: MAX_MESSAGES_PER_POLL,
    });
    const messages = list.data.messages ?? [];
    if (messages.length === 0) {
      return { ok: true, message: "신규 메일 없음", newMails: 0, newAttachments: 0, unclassified: 0 };
    }

    const teams = await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams);

    for (const ref of messages) {
      if (!ref.id) continue;

      const full = await gmail.users.messages.get({ userId, id: ref.id, format: "full" });
      const payload = full.data.payload as GmailPart | undefined;
      const headers = payload?.headers ?? [];
      const headerMap = new Map(headers.map((h) => [h.name.toLowerCase(), h.value]));
      const messageIdHeader = decodeHeader(headerMap.get("message-id")) || `gmail-${ref.id}`;
      const subject = decodeHeader(headerMap.get("subject"));
      const fromHeader = decodeHeader(headerMap.get("from"));
      const fromAddress = extractAddress(fromHeader);

      // 허용 발신자 외 메일은 수집하지 않음 (무관 메일 차단, 읽음 처리도 안 함)
      if (!opts?.fromEmail && allowlist.size && !allowlist.has(fromAddress)) {
        continue;
      }
      const internalDate = full.data.internalDate
        ? new Date(Number(full.data.internalDate))
        : new Date();
      const receivedAt = internalDate.toISOString();

      // Skip if already logged
      const existing = await db.select()
        .from(schema.mailLog)
        .where(eq(schema.mailLog.messageId, messageIdHeader))
        .limit(1);
      if (existing.length > 0) {
        alreadyProcessed++;
        // already processed in a prior run — still mark read so we stop seeing it
        if (!skipMarkRead) {
          await gmail.users.messages.modify({ userId, id: ref.id, requestBody: { removeLabelIds: ["UNREAD"] } });
        }
        continue;
      }

      // 메시지 단위 오류 격리 — 한 메일의 첨부 다운로드/업로드 실패가 폴 전체를 중단시키지 않게.
      // 실패해도 catch에서 mailLog 마커를 남겨(=error) 무한 재수집을 막는다.
      try {
      // 본문 텍스트 추출 (text/plain 우선, 없으면 text/html 평문화)
      let bodyText = "";
      for (const p of walkParts(payload)) {
        if (!p.body?.data) continue;
        if (p.mimeType === "text/plain" || (p.mimeType === "text/html" && !bodyText)) {
          const raw = Buffer.from(p.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
          const plain = p.mimeType === "text/html" ? raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ") : raw;
          if (p.mimeType === "text/plain") { bodyText = plain; break; }
          if (!bodyText) bodyText = plain;
        }
      }

      // 팀 매칭: 보낸이 → 제목/본문/첨부파일명 별칭 순
      const firstAttachmentName = [...walkParts(payload)].find((p) => p.filename)?.filename ?? "";
      const teamId = await classifyTeam({
        fromAddress,
        subject,
        body: bodyText,
        fileName: firstAttachmentName,
      });
      const teamName = teamNameLookup(teamId, teams);

      // stepup2(메일함 본인) 발신 메일 특수 규칙:
      //  - 외부로 나간(보낸) 메일은 일체 수집 안 함
      //  - stepup2 → stepup2 자기 업로드는 "딸기 11기(장성)" 관련만 수집
      const selfEmail = userId.toLowerCase();
      if (fromAddress === selfEmail) {
        const recipients = `${decodeHeader(headerMap.get("to"))} ${decodeHeader(headerMap.get("cc"))}`.toLowerCase();
        const toSelf = recipients.includes(selfEmail);
        if (!toSelf) continue; // 외부 발송(나간) 메일 → 제외
        if (!isJangseongStrawberry(teamName, subject, bodyText, firstAttachmentName)) continue; // 딸기11기(장성)만 허용
      }

      // 영수증 회차 자동배정용 — 제목/본문에서 N차시 추출
      const receiptSession = detectReceiptSessionNo(subject) ?? detectReceiptSessionNo(bodyText);
      let attachmentSaved = 0;

      // 문서 1건을 documents 행으로 저장 (직접 첨부 · ZIP 내부 문서 공용).
      // 파일명이 특정 팀을 명시하면 그 팀으로 분류(겸임 코디 메일이 엉뚱한 팀에 묶이는 것 보정),
      // 아니면 메일 단위 teamId 사용.
      const saveDoc = async (fileName: string, fileBytes: Buffer): Promise<void> => {
        const fileTeam = await classifyTeamByText(fileName);
        const docTeamId = fileTeam ?? teamId;
        const docTeamName = teamNameLookup(docTeamId, teams);
        const fileDocType = docTeamId ? classifyDocType(subject, fileName) : "미분류";
        const month = detectMonth(subject, receivedAt, bodyText, fileName);
        const sessionNo = await detectSessionNo({ teamId: docTeamId, subject, body: bodyText, fileName, receivedAt });

        // 멱등 INSERT — 같은 팀+파일명이면 이미 수집된 것으로 보고 건너뜀.
        // (mailLog 마커가 누락된 채 재폴이 돌아도 문서가 중복 생성되지 않도록 방어)
        const dup = await db
          .select({ id: schema.documents.id })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.source, "mail"),
              eq(schema.documents.fileName, fileName),
              docTeamId
                ? eq(schema.documents.teamId, docTeamId)
                : and(isNull(schema.documents.teamId), eq(schema.documents.emailFrom, fromAddress)),
            ),
          )
          .limit(1);
        if (dup.length > 0) { attachmentSaved++; return; }

        const upload = await uploadDocumentToDrive({ teamName: docTeamName, docType: fileDocType, month, fileName, bytes: fileBytes });
        if (upload.ok) {
          await db.insert(schema.documents).values({
            teamId: docTeamId,
            docType: fileDocType as "출석부" | "코디일지" | "경비영수증" | "강사비지급확인서" | "교육생일지" | "미분류",
            month,
            sessionNo,
            fileName,
            filePath: upload.webViewLink ?? upload.fileId ?? "",
            source: "mail",
            status: "submitted",
            receivedAt,
            emailFrom: fromAddress,
            emailSubject: subject,
          });
          attachmentSaved++;
          newAttachments++;
          if (fileDocType === "미분류") unclassified++;
        }
      };

      for (const part of walkParts(payload)) {
        const filename = part.filename;
        if (!filename) continue;
        const ext = fileExt(filename);
        const isDocExt = ALLOWED_EXT.includes(ext);
        const isArchive = ARCHIVE_EXT.includes(ext);
        if (!isDocExt && !isArchive) continue;
        const size = part.body?.size ?? 0;
        if (size > MAX_SIZE) continue;
        const attId = part.body?.attachmentId;
        if (!attId) continue;

        const att = await gmail.users.messages.attachments.get({
          userId,
          messageId: ref.id,
          id: attId,
        });
        const data = att.data.data;
        if (!data) continue;

        // Gmail returns URL-safe base64. Decode to bytes.
        const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
        const bytes = Buffer.from(b64, "base64");

        const docType = teamId ? classifyDocType(subject, filename) : "미분류";

        // 문서 행 생성:
        //  - 직접 문서 첨부(pdf/hwp/xlsx 등)는 그대로 1건
        //  - .hwpx 는 그 자체가 한글 문서 → 1건 저장(내부 영수증은 아래에서 별도 추출)
        //  - .zip 컨테이너는 내부 문서 파일들을 각각 1건씩 추출 저장
        if (isDocExt) {
          await saveDoc(filename, bytes);
        } else if (ext === ".hwpx") {
          await saveDoc(filename, bytes);
        } else if (ext === ".zip") {
          for (const d of extractEmbeddedDocuments(bytes, filename)) {
            await saveDoc(d.name, d.buf);
          }
        }

        // 정산 자동 반영 — 직접 PDF/이미지 영수증 + ZIP/HWPX/HWP 내장 영수증을 모두 추출.
        // 여러 페이지 PDF(수당지급확인서 등)는 페이지별로 분리해 1인 1건 등록.
        if (teamId) {
          try {
            const cands = buildReceiptCandidates(ext, filename, subject, bytes, docType);
            if (cands.length > 0) {
              const expanded = await expandPdfCandidates(cands);
              for (const c of expanded) {
                const outcome = await processReceiptCandidate(c, {
                  teamId, fromAddr: fromAddress, subject, messageId: messageIdHeader,
                  receivedAt, subjectSession: receiptSession, teams,
                });
                if (outcome.status === "created") expensesCreated++;
              }
            }
          } catch {
            // 정산 반영 실패해도 서류 수집 자체는 유지
          }
        }
      }

      await db.insert(schema.mailLog).values({
        messageId: messageIdHeader,
        fromAddress,
        subject,
        receivedAt,
        classifiedTeamId: teamId,
        classifiedDocType: attachmentSaved > 0 ? "다중" : null,
        processedStatus: teamId ? "classified" : "unclassified",
      });
      newMails++;

      // Mark as read so subsequent polls skip it
      if (!skipMarkRead) {
        await gmail.users.messages.modify({
          userId,
          id: ref.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
      }
      } catch (err) {
        // 이 메일 처리 중 오류 — 다음 메일로 계속. 마커를 남겨 다음 폴에서 무한 재수집되지 않게.
        // (멱등 INSERT와 함께, 마커 없이 문서만 남는 창을 제거)
        try {
          await db.insert(schema.mailLog).values({
            messageId: messageIdHeader,
            fromAddress,
            subject,
            receivedAt,
            classifiedTeamId: null,
            classifiedDocType: null,
            processedStatus: "error",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // 마커 INSERT마저 실패(예: messageId UNIQUE 충돌) — 무시하고 다음 메일로
        }
      }
    }

    const message =
      newMails === 0 && alreadyProcessed > 0
        ? `이미 수집됨 — 해당 기간 메일 ${alreadyProcessed}건은 모두 처리 완료 (신규 0건)`
        : `${newMails}건 처리, 첨부 ${newAttachments}건, 미분류 ${unclassified}건` +
          (expensesCreated ? `, 정산반영 ${expensesCreated}건` : "") +
          (alreadyProcessed ? ` · 기수집 ${alreadyProcessed}건 제외` : "");
    return {
      ok: true,
      message,
      newMails,
      newAttachments,
      unclassified,
      expensesCreated,
      alreadyProcessed,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}

export async function updateMailStatus(result: MailSyncResult) {
  await db
    .update(schema.integrationStatus)
    .set({
      enabled: isMailEnabled(),
      lastRunAt: new Date().toISOString(),
      status: result.ok ? "ok" : "error",
      message: result.message,
    })
    .where(eq(schema.integrationStatus.type, "mail"));
}
