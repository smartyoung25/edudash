import fs from "fs";
import path from "path";
import { getDriveFileMeta } from "@/lib/integrations/drive";

export type ReceiptStatus = "ok" | "missing" | "none";

/**
 * 영수증 파일이 실제로 조회 가능한지 판별.
 * - none: 영수증 경로 자체가 없음(미첨부)
 * - missing: 경로는 있으나 원본 파일이 없음(Drive 삭제/경로 불일치 등)
 * - ok: 정상 조회 가능
 *
 * Drive 메타 조회가 예외로 실패하면(자격증명 등) 일괄 '누락' 오표시를 막기 위해 ok로 둔다.
 */
export async function getReceiptStatus(
  filePath: string | null | undefined,
): Promise<ReceiptStatus> {
  if (!filePath) return "none";
  try {
    if (filePath.startsWith("drive:")) {
      const meta = await getDriveFileMeta(filePath.slice("drive:".length));
      return meta ? "ok" : "missing";
    }
    return fs.existsSync(path.join(process.cwd(), filePath)) ? "ok" : "missing";
  } catch {
    return "ok";
  }
}

/** expenses 배열의 영수증 상태를 id→status Map으로 일괄 계산 */
export async function getReceiptStatusMap(
  rows: { id: number; receiptFilePath: string | null }[],
): Promise<Map<number, ReceiptStatus>> {
  const entries = await Promise.all(
    rows.map(async (e) => [e.id, await getReceiptStatus(e.receiptFilePath)] as const),
  );
  return new Map(entries);
}
