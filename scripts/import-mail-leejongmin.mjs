// 이종민 코디(감귤6) 메일 — 서류 + 영수증 (최근 30일)
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const FROM = "teenglish@naver.com";
const DAYS = 30;

console.log("환경변수:");
console.log("  GMAIL_USER:", process.env.GMAIL_USER || "(미설정)");
console.log("  IMAP_USER:", process.env.IMAP_USER || "(미설정)");
console.log("  IMAP_PASSWORD:", process.env.IMAP_PASSWORD ? "***" : "없음");
console.log("  GOOGLE_VISION_KEY_PATH:", process.env.GOOGLE_VISION_KEY_PATH || "(미설정)");

console.log(`\n=== 1) 서류 수집 (Gmail API, from:${FROM}, ${DAYS}일) ===`);
try {
  const { pollMailbox } = await import("../src/lib/integrations/gmail.ts");
  const r1 = await pollMailbox({ fromEmail: FROM, sinceDays: DAYS, includeRead: true });
  console.log(JSON.stringify(r1, null, 2));
} catch (e) {
  console.error("[서류] 오류:", e?.message || e);
}

console.log(`\n=== 2) 영수증 수집 (IMAP+OCR, from:${FROM}, ${DAYS}일) ===`);
try {
  const { importReceiptsFromMail } = await import("../src/lib/integrations/imap-receipts.ts");
  const r2 = await importReceiptsFromMail({ fromEmail: FROM, sinceDays: DAYS });
  console.log(JSON.stringify(r2, null, 2));
} catch (e) {
  console.error("[영수증] 오류:", e?.message || e);
}

console.log("\n=== 완료 ===");
