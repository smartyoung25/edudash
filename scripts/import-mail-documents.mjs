// 메일 첨부 서류(출석부·코디일지·경비영수증 등)를 Gmail에서 가져와
// Google Drive 업로드 + documents 테이블 기록. 운영 DB(TURSO_*) 대상.
import "dotenv/config";

console.log("환경변수 체크:");
console.log("  GMAIL_USER:", process.env.GMAIL_USER || "(없음)");
console.log("  GOOGLE_VISION_KEY_PATH:", process.env.GOOGLE_VISION_KEY_PATH || "(없음)");
console.log("  DRIVE_ROOT_FOLDER_ID:", process.env.DRIVE_ROOT_FOLDER_ID ? "설정됨" : "(없음)");
console.log("  TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "설정됨(운영)" : "(미설정 → 로컬 SQLite)");

const { pollMailbox, updateMailStatus } = await import("../src/lib/integrations/gmail.ts");

// 기본은 cron 과 동일하게 is:unread has:attachment.
// 읽음 처리 없이 최근 N일을 다시 훑고 싶으면 아래 옵션 사용:
//   { includeRead: true, sinceDays: 30 }
const opts = process.argv[2] === "--rescan"
  ? { includeRead: true, sinceDays: Number(process.argv[3]) || 30 }
  : undefined;

console.log(`\n서류 메일 동기화 시작... ${opts ? JSON.stringify(opts) : "(기본: 미읽음+첨부)"}`);
const result = await pollMailbox(opts);
await updateMailStatus(result);

console.log("\n=== 결과 ===");
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
