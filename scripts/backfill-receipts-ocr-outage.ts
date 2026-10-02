/**
 * 2026-08-20 OCR 중단 기간에 누락된 영수증 백필
 *
 * 배경: GCP 결제 계정의 무료 체험판이 2026-08-20에 종료되어 Cloud Vision이 모든 요청을
 * PERMISSION_DENIED로 거부했다. 크론(pollMailbox)은 계속 돌았지만 processReceiptCandidate가
 * OCR 단계에서 throw → 지출 미등록 → 그런데 메일은 읽음 처리 + mail_log 마커가 남아
 * 다음 폴에서 영원히 재시도되지 않았다. 그래서 43일간 영수증 자동 등록이 0건이었다.
 *
 * 이 스크립트는 mail_log 마커를 무시하고(ignoreMailLog) 해당 기간 메일을 다시 훑는다.
 * 하위 저장은 모두 멱등이라 중복이 생기지 않는다.
 *   - 서류(documents): (source=mail, 팀, 파일명) 기준 중복 차단
 *   - 지출(expenses):  (mailMessageId, 첨부명) 기준 중복 차단
 * includeRead=true 이므로 메일을 읽음 처리하지도 않는다.
 *
 * 사용법:
 *   npx vercel env pull .env.vercel --environment=production --yes
 *   npx tsx --env-file=.env.vercel scripts/backfill-receipts-ocr-outage.ts [--days=45] [--dry]
 */

import { db, schema } from "../src/db/client";
import { pollMailbox } from "../src/lib/integrations/gmail";
import { isOcrEnabled } from "../src/lib/env";
import { extractText } from "../src/lib/integrations/ocr";
import { sql } from "drizzle-orm";

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) || fallback : fallback;
};
const DAYS = arg("days", 45);
const DRY = process.argv.includes("--dry");

async function mailExpenseStats() {
  const rows = await db.all<{ n: number; ocr_ok: number; last_at: string | null }>(sql`
    SELECT COUNT(*) AS n,
           SUM(CASE WHEN vendor_name IS NOT NULL AND vendor_name <> '' THEN 1 ELSE 0 END) AS ocr_ok,
           MAX(created_at) AS last_at
    FROM expenses WHERE source = 'mail'`);
  return rows[0];
}

async function main() {
  console.log(`\n=== 영수증 백필 (최근 ${DAYS}일, ${DRY ? "DRY RUN" : "실제 반영"}) ===\n`);

  // 1) 선행 조건 — OCR이 살아있지 않으면 백필해봐야 전부 실패한다
  if (!isOcrEnabled()) {
    console.error("중단: OCR 자격증명이 설정되지 않았습니다.");
    process.exit(1);
  }
  const probe = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  try {
    await extractText(probe, "image/png");
    console.log("Vision API 확인: OK\n");
  } catch (e: any) {
    console.error("중단: Vision API가 동작하지 않습니다 —", e?.message);
    console.error("결제 계정 상태를 먼저 확인하세요.");
    process.exit(1);
  }

  // 2) 사전 상태
  const before = await mailExpenseStats();
  console.log("[사전] mail 영수증", before.n, "건 / OCR 인식", before.ocr_ok, "건 / 마지막", before.last_at);

  if (DRY) {
    console.log("\nDRY RUN — 실제 수집은 하지 않습니다. --dry 를 빼고 다시 실행하세요.");
    return;
  }

  // 3) 백필 실행
  console.log("\n메일 재수집 중...");
  const result = await pollMailbox({ sinceDays: DAYS, includeRead: true, ignoreMailLog: true });
  console.log("결과:", result.ok ? "성공" : "실패", "—", result.message);

  // 4) 사후 상태 + 신규분
  const after = await mailExpenseStats();
  const created = Number(after.n) - Number(before.n);
  console.log("\n[사후] mail 영수증", after.n, "건 / OCR 인식", after.ocr_ok, "건");
  console.log("신규 등록:", created, "건");

  if (created > 0) {
    const rows = await db.all<{ id: number; spent_date: string; category: string; vendor_name: string | null; total_amount: number }>(sql`
      SELECT id, spent_date, category, vendor_name, total_amount
      FROM expenses WHERE source = 'mail'
      ORDER BY id DESC LIMIT ${created}`);
    console.log("\n--- 새로 등록된 영수증 ---");
    for (const r of rows.reverse()) {
      console.log(
        `  #${r.id}  ${r.spent_date}  ${String(r.category).padEnd(8)}  ${(r.vendor_name ?? "(상호없음)").padEnd(20)}  ${r.total_amount.toLocaleString()}원`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n실패:", e);
    process.exit(1);
  });
