import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./data/app.db" });

const updates = [
  ["남기열", "namkeeyeul@gmail.com"],
  ["신미하", "kak15022@naver.com"],
  ["노미영, 이태규", "wooripodo@naver.com"],
  ["조효창", "banga4hc@naver.com"],
  ["현민승", "minseung0238@daum.net"],
];

for (const [name, email] of updates) {
  const r = await c.execute({
    sql: "UPDATE teams SET coordinator_email=? WHERE coordinator_name=?",
    args: [email, name],
  });
  console.log(name, "→", email, "rows:", r.rowsAffected);
}

const rows = (await c.execute("SELECT id,name,coordinator_name,coordinator_email FROM teams ORDER BY id")).rows;
for (const t of rows) console.log(t.id, t.name, "|", t.coordinator_name, t.coordinator_email || "-");
