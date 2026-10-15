// 일회성: agency_expenses 중 vat_amount > total_amount 인 행(사업자번호/카드번호/전화번호 등을
// 부가세로 오인식한 OCR 오류) 복구. vat_amount를 (total_amount - supply_amount) 로 재계산하고,
// 그 결과도 음수/합계초과면 0으로 낮춘다. total_amount/supply_amount는 건드리지 않는다
// (신고 기준 근거는 OCR이 잡은 원본 합계이므로 그대로 신뢰).
// 실행: node scripts/fix-vat-amount-overflow.mjs [--prod] [--apply]
//   --apply 없이 실행하면 dry-run(변경 예정 내역만 출력, DB 반영 안 함)
import { config } from "dotenv";
import fs from "fs";
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");

async function run(url, authToken, label) {
  const client = createClient(authToken ? { url, authToken } : { url });

  const res = await client.execute(
    "SELECT id, spent_date, supply_amount, vat_amount, total_amount, vendor_name, dedup_key FROM agency_expenses WHERE vat_amount > total_amount ORDER BY id"
  );

  console.log(`\n[${label}] 대상 ${res.rows.length}건`);
  for (const row of res.rows) {
    const supply = row.supply_amount ?? 0;
    const total = row.total_amount ?? 0;
    const newVat = Math.max(0, Math.min(total, total - supply));
    console.log(
      `  id=${row.id} ${row.spent_date} "${row.vendor_name ?? "-"}" | 부가세 ${row.vat_amount.toLocaleString()}원 → ${newVat.toLocaleString()}원 (합계 ${total.toLocaleString()}원, 공급가 ${supply.toLocaleString()}원) [${row.dedup_key ?? "-"}]`
    );
    if (APPLY) {
      await client.execute({
        sql: "UPDATE agency_expenses SET vat_amount = ? WHERE id = ?",
        args: [newVat, row.id],
      });
    }
  }
  console.log(`\n[${label}] ${res.rows.length}건 ${APPLY ? "반영 완료" : "(dry-run, --apply로 반영)"}`);
}

if (PROD) {
  if (!fs.existsSync(".env.vercel.prod")) {
    console.log("· .env.vercel.prod 없음 — 운영 실행 불가");
    process.exit(1);
  }
  config({ path: ".env.vercel.prod" });
  if (!process.env.TURSO_DATABASE_URL) {
    console.log("· TURSO 자격증명 없음 — 운영 실행 불가");
    process.exit(1);
  }
  await run(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN, "운영 Turso");
} else {
  await run("file:./data/app.db", null, "로컬 data/app.db");
}
process.exit(0);
