import path from "path";
import fs from "fs/promises";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { env, isMailEnabled } from "../env";
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

function getAddress(addr: AddressObject | AddressObject[] | undefined): string {
  if (!addr) return "";
  const a = Array.isArray(addr) ? addr[0] : addr;
  return a?.value?.[0]?.address ?? "";
}

export async function pollMailbox(): Promise<MailSyncResult> {
  if (!isMailEnabled()) {
    return { ok: false, message: "IMAP 자격증명 미설정" };
  }
  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: true,
    auth: { user: env.IMAP_USER, pass: env.IMAP_PASSWORD },
    logger: false,
  });

  let newMails = 0;
  let newAttachments = 0;
  let unclassified = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // UNSEEN만 처리
      for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true, internalDate: true })) {
        const messageId = msg.envelope?.messageId ?? `noid-${msg.uid}`;

        // 중복 체크
        const existing = await db.select().from(schema.mailLog).where(eq(schema.mailLog.messageId, messageId)).limit(1);
        if (existing.length > 0) continue;

        const parsed = await simpleParser(msg.source as Buffer);
        const fromAddress = getAddress(parsed.from);
        const subject = parsed.subject ?? "";
        const internalDate = msg.internalDate ?? new Date();
        const receivedAt = (internalDate instanceof Date ? internalDate : new Date(internalDate)).toISOString();

        const teamId = await classifyByEmail(fromAddress);
        let attachmentSaved = 0;

        for (const att of parsed.attachments) {
          if (!att.filename) continue;
          const ext = path.extname(att.filename).toLowerCase();
          if (!ALLOWED_EXT.includes(ext)) continue;
          if (att.size > MAX_SIZE) continue;

          const docType = classifyDocType(subject, att.filename);
          const month = detectMonth(subject, receivedAt);
          const finalDocType = teamId ? docType : "미분류";

          // 저장
          const dir = path.join(process.cwd(), "data", "uploads", "mail");
          await fs.mkdir(dir, { recursive: true });
          const safeName = `${Date.now()}_${att.filename.replace(/[^\w가-힣.\-]/g, "_")}`;
          const fp = path.join(dir, safeName);
          await fs.writeFile(fp, att.content);
          attachmentSaved++;

          await db.insert(schema.documents).values({
            teamId: teamId,
            docType: finalDocType as "출석부" | "코디일지" | "경비영수증" | "강사비지급확인서" | "교육생일지" | "미분류",
            month: month,
            fileName: att.filename,
            filePath: fp.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, ""),
            source: "mail",
            status: "submitted",
            receivedAt,
            emailFrom: fromAddress,
            emailSubject: subject,
          });
          newAttachments++;
          if (finalDocType === "미분류") unclassified++;
        }

        await db.insert(schema.mailLog).values({
          messageId,
          fromAddress,
          subject,
          receivedAt,
          classifiedTeamId: teamId,
          classifiedDocType: attachmentSaved > 0 ? "다중" : null,
          processedStatus: teamId ? "classified" : "unclassified",
        });
        newMails++;

        // 처리 완료 표시
        await client.messageFlagsAdd(msg.uid, ["\\Seen"]);
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return {
      ok: true,
      message: `${newMails}건 처리, 첨부 ${newAttachments}건, 미분류 ${unclassified}건`,
      newMails, newAttachments, unclassified,
    };
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
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
