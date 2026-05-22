// 모든 코디 메일에서 영수증 자동 가져오기
import "dotenv/config";

console.log("환경변수 체크:");
console.log("  IMAP_USER:", process.env.IMAP_USER);
console.log("  IMAP_PASSWORD:", process.env.IMAP_PASSWORD ? "***설정됨***" : "없음");
console.log("  GOOGLE_VISION_KEY_PATH:", process.env.GOOGLE_VISION_KEY_PATH);

const { importReceiptsFromMail } = await import("../src/lib/integrations/imap-receipts.ts");

console.log("\n메일 가져오기 시작 (모든 코디, 최근 120일)...");
const result = await importReceiptsFromMail({
  sinceDays: 120,
});

console.log("\n=== 결과 ===");
console.log(JSON.stringify(result, null, 2));
