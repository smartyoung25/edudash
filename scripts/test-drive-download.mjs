// Drive 다운로드 테스트
import "dotenv/config";
const { downloadDriveFile } = await import("../src/lib/integrations/drive.ts");

// 차선애 메일에 있던 Drive 파일 ID
const FILE_ID = "1m3J9ZCRGHN9YIyVo30VCdt7dOQUVYpz1";

console.log("Drive 파일 다운로드 시도:", FILE_ID);
const r = await downloadDriveFile(FILE_ID);
if (r.ok) {
  console.log(`✅ 성공: ${r.name} (${r.mimeType}, ${r.buf.length} bytes)`);
} else {
  console.log(`❌ 실패: ${r.message}`);
}
