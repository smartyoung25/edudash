/**
 * Gmail API users.messages.send 래퍼.
 * gmail.modify 스코프 안에 send 권한 포함됨 — 별도 scope 추가 불필요.
 */
import { getGmailClient } from "./google-auth";
import { env } from "../env";

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeader(s: string): string {
  // RFC 2047 UTF-8 base64 encoding for non-ASCII headers (한글 제목 대응)
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }): Promise<{ ok: boolean; message: string }> {
  const gmail = getGmailClient();
  if (!gmail) return { ok: false, message: "Gmail 클라이언트 미설정 (GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_DELEGATED_USER 누락)" };

  const from = env.GMAIL_USER;
  if (!from) return { ok: false, message: "GMAIL_USER 환경변수 미설정" };

  const boundary = `=_part_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(opts.text ?? opts.html.replace(/<[^>]+>/g, ""), "utf-8").toString("base64"),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(opts.html, "utf-8").toString("base64"),
    ``,
    `--${boundary}--`,
    ``,
  ];
  const raw = base64UrlEncode(Buffer.from(lines.join("\r\n"), "utf-8"));

  try {
    const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return { ok: true, message: `발송 완료 (id=${res.data.id})` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `발송 실패: ${msg}` };
  }
}
