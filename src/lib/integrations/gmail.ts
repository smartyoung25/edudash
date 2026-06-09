import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { env, isMailEnabled } from "../env";
import { getGmailClient } from "./google-auth";
import { uploadDocumentToDrive } from "./drive";
import { classifyTeam, classifyDocType, detectMonth, detectSessionNo, resetClassifierCache } from "./classifier";
import { processReceiptCandidate, detectSessionNo as detectReceiptSessionNo } from "./imap-receipts";
import { EXTRA_COORDINATOR_EMAILS } from "./coordinator-overrides";

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
const MAX_SIZE = 20 * 1024 * 1024;
const MAX_MESSAGES_PER_POLL = 50;

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

// 딸기 11기(장성) 관련 메일인지 판별 — 분류된 팀명/제목/본문/파일명 종합
function isJangseongStrawberry(...texts: (string | null | undefined)[]): boolean {
  const hay = texts.filter(Boolean).join(" ");
  if (/장성/.test(hay)) return true;                       // 지역명(이 팀 고유)
  if (/딸기\s*11(?!\d)/.test(hay)) return true;            // "딸기11", "딸기 11"
  if (/딸기/.test(hay) && /(?<!\d)11\s*기/.test(hay)) return true; // "딸기 … 11기"
  return false;
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

      for (const part of walkParts(payload)) {
        const filename = part.filename;
        if (!filename) continue;
        const ext = fileExt(filename);
        if (!ALLOWED_EXT.includes(ext)) continue;
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
        const month = detectMonth(subject, receivedAt, bodyText, filename);
        const sessionNo = await detectSessionNo({
          teamId,
          subject,
          body: bodyText,
          fileName: filename,
          receivedAt,
        });

        const upload = await uploadDocumentToDrive({
          teamName,
          docType,
          month,
          fileName: filename,
          bytes,
        });
        if (!upload.ok) continue;

        await db.insert(schema.documents).values({
          teamId,
          docType: docType as "출석부" | "코디일지" | "경비영수증" | "강사비지급확인서" | "교육생일지" | "미분류",
          month,
          sessionNo,
          fileName: filename,
          filePath: upload.webViewLink ?? upload.fileId ?? "",
          source: "mail",
          status: "submitted",
          receivedAt,
          emailFrom: fromAddress,
          emailSubject: subject,
        });

        attachmentSaved++;
        newAttachments++;
        if (docType === "미분류") unclassified++;

        // 경비영수증(이미지/PDF) → OCR 후 팀별/기관 정산에 자동 반영
        if (teamId && docType === "경비영수증" && [".pdf", ".jpg", ".jpeg", ".png"].includes(ext)) {
          try {
            const outcome = await processReceiptCandidate(
              { name: filename, buf: bytes, mime: ext === ".pdf" ? "application/pdf" : undefined },
              { teamId, fromAddr: fromAddress, subject, messageId: messageIdHeader, receivedAt, subjectSession: receiptSession, teams },
            );
            if (outcome.status === "created") expensesCreated++;
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
