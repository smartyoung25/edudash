import fs from "fs";
import path from "path";

export type ReceiptStatus = "ok" | "missing" | "none";

/**
 * 영수증 파일이 실제로 조회 가능한지 판별.
 * - none: 영수증 경로 자체가 없음(미첨부)
 * - missing: 경로는 있으나 원본 파일이 없음(로컬 경로인데 디스크에 없음 등)
 * - ok: 정상 조회 가능
 *
 * drive:<fileId> 경로는 첨부된 것으로 보고 즉시 ok 처리한다.
 * (페이지마다 영수증 수십 건을 Drive API 로 일괄 조회하면 느리고 rate-limit 으로
 *  일시적 '누락' 오표시가 발생하므로, 무결성은 클릭 시 영수증 라우트가 lazy 처리.)
 */
export async function getReceiptStatus(
  filePath: string | null | undefined,
): Promise<ReceiptStatus> {
  if (!filePath) return "none";
  try {
    if (filePath.startsWith("drive:")) return "ok";
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
