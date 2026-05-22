// 김성태 코디 메일에서 영수증 자동 가져오기
import "dotenv/config";

// Next.js의 절대경로 import는 직접 안되니까, 환경변수만 검증하고 동적 import
console.log("환경변수 체크:");
console.log("  IMAP_HOST:", process.env.IMAP_HOST);
console.log("  IMAP_USER:", process.env.IMAP_USER);
console.log("  IMAP_PASSWORD:", process.env.IMAP_PASSWORD ? "***설정됨***" : "없음");
console.log("  GOOGLE_VISION_KEY_PATH:", process.env.GOOGLE_VISION_KEY_PATH);

const { importReceiptsFromMail } = await import("../src/lib/integrations/imap-receipts.ts");

console.log("\n메일 가져오기 시작 (김성태 코디 = 37210114ok@gmail.com, 최근 90일)...");
const result = await importReceiptsFromMail({
  fromEmail: "37210114ok@gmail.com",
  sinceDays: 90,
});

console.log("\n=== 결과 ===");
console.log(JSON.stringify(result, null, 2));
