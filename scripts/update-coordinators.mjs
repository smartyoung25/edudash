import { createClient } from "@libsql/client";

const c = createClient({ url: "file:./data/app.db" });

const updates = [
  [16, "신현구", "김성태"],
  [17, "신현구", "김성태"],
  [18, "강영식", "신미하"],
  [19, "김종필", "이종민"],
  [20, "황종헌", "남기열"],
  [21, "황종헌", "남기열"],
  [22, "김종필", "신효섭"],
  [23, "이익영", "노미영, 이태규"],
  [25, "박근수", "조효창"],
  [26, "김종우", "이종민"],
  [27, "정대천", "김성태"],
  [28, "현성익", "현민승"],
  [29, "이재규", "차선애"],
  [30, "이재규", "차선애"],
  [31, "정규환", null],
];

for (const [id, prof, coord] of updates) {
  const r = await c.execute({
    sql: "UPDATE teams SET professor_name=?,professor_phone=NULL,professor_email=NULL,coordinator_name=?,coordinator_phone=NULL,coordinator_email=NULL WHERE id=?",
    args: [prof, coord, id],
  });
  console.log("id", id, "→", prof, "/", coord, "rows:", r.rowsAffected);
}

const r = await c.execute("SELECT id,name,professor_name,coordinator_name FROM teams ORDER BY id");
for (const t of r.rows) console.log(t.id, t.name, "|", t.professor_name, "/", t.coordinator_name);
