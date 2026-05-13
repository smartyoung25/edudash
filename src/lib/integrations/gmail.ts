import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { env, isMailEnabled } from "../env";
import { getGmailClient } from "./google-auth";
import { uploadDocumentToDrive } from "./drive";
import { classifyByEmail, classifyDocType, detectMonth } from "./classifier";

export interface MailSyncResult {
  ok: boolean;
  message: string;
  newMails?: number;
  newAttachments?: number;
  unclassified?: number;
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

export async function pollMailbox(): Promise<MailSyncResult> {
  if (!isMailEnabled()) {
    return { ok: false, message: "Gmail 자격증명 미설정 (GOOGLE_SERVICE_ACCOUNT_JSON / GMAIL_USER)" };
  }
  const gmail = getGmailClient();
  if (!gmail) return { ok: false, message: "Gmail client not initialized" };

  const userId = env.GMAIL_USER;
  let newMails = 0;
  let newAttachments = 0;
  let unclassified = 0;

  try {
    const list = await gmail.users.messages.list({
      userId,
      q: "is:unread has:attachment",
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
        // already processed in a prior run — still mark read so we stop seeing it
        await gmail.users.messages.modify({ userId, id: ref.id, requestBody: { removeLabelIds: ["UNREAD"] } });
        continue;
      }

      const teamId = await classifyByEmail(fromAddress);
      const teamName = teamNameLookup(teamId, teams);
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
        const month = detectMonth(subject, receivedAt);

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
      await gmail.users.messages.modify({
        userId,
        id: ref.id,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
    }

    return {
      ok: true,
      message: `${newMails}건 처리, 첨부 ${newAttachments}건, 미분류 ${unclassified}건`,
      newMails,
      newAttachments,
      unclassified,
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
