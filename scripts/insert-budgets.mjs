import { createClient } from "@libsql/client";
import fs from "fs";

const c = createClient({ url: "file:./data/app.db" });
const data = JSON.parse(fs.readFileSync("budget_results.json", "utf-8"));

for (const [teamId, cats] of Object.entries(data)) {
  for (const [category, amount] of Object.entries(cats)) {
    if (amount <= 0) continue;
    // Upsert
    const existing = (await c.execute({
      sql: "SELECT id FROM expense_budgets WHERE team_id=? AND category=?",
      args: [Number(teamId), category],
    })).rows;
    if (existing.length) {
      await c.execute({
        sql: "UPDATE expense_budgets SET amount=? WHERE id=?",
        args: [amount, existing[0].id],
      });
    } else {
      await c.execute({
        sql: "INSERT INTO expense_budgets (team_id, category, amount) VALUES (?, ?, ?)",
        args: [Number(teamId), category, amount],
      });
    }
  }
  console.log(`team ${teamId}: ${Object.entries(cats).filter(([,v])=>v>0).map(([k,v])=>`${k}=${v.toLocaleString()}`).join(", ")}`);
}
console.log("\n✅ 예산 등록 완료");
