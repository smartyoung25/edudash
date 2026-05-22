// 팀별정산의 출장비 카테고리를 기관경비 출장비로 이관
import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./data/app.db" });

const rows = (await c.execute("SELECT * FROM expenses WHERE category='출장비'")).rows;
console.log(`이관 대상: ${rows.length}건`);

let moved = 0;
for (const r of rows) {
  await c.execute({
    sql: `INSERT INTO agency_expenses
      (kind, spent_date, supply_amount, vat_amount, total_amount,
       vendor_type, vendor_biz_no, vendor_name, vendor_ceo,
       card_type, card_last4, payer_name, reimburse_status,
       memo, receipt_file_path, receipt_mime_type, created_at)
      VALUES ('출장비', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r.spent_date, r.supply_amount, r.vat_amount, r.total_amount,
      r.vendor_type, r.vendor_biz_no, r.vendor_name, r.vendor_ceo,
      r.card_type, r.card_last4, r.payer_name, r.reimburse_status || "미정산",
      r.memo, r.receipt_file_path, r.receipt_mime_type, r.created_at,
    ],
  });
  await c.execute({ sql: "DELETE FROM expenses WHERE id=?", args: [r.id] });
  moved++;
  console.log(`  ${r.spent_date} ${r.total_amount.toLocaleString()}원 → agency`);
}
console.log(`\n완료: ${moved}건`);
