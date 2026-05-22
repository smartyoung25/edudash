import { createClient } from "@libsql/client";
const c = createClient({ url: "file:./data/app.db" });

const PROFS = {
  "신현구": ["010-3576-7157", "sinmy@korea.com"],
  "강영식": ["010-9968-9638", "kak15022@naver.com"],
  "김종필": ["010-3653-5307", "djdnfmal@gmail.com"],
  "황종헌": ["010-5098-5917", "jjhjheon@gmail.com"],
  "이익영": ["010-9030-8860", "wooripodo@naver.com"],
  "박근수": ["010-8605-3535", "pear9988@naver.com"],
  "김종우": ["010-3699-1473", "hl4vl@daum.net"],
  "정대천": ["010-2734-9000", "jdc5959@naver.com"],
  "현성익": ["010-3692-5001", "hsk0238@naver.com"],
  "이재규": ["010-4419-4434", "jkhihi@hanmail.net"],
  "정규환": ["010-4924-4116", "bio4116@naver.com"],
};

for (const [name, [phone, email]] of Object.entries(PROFS)) {
  const r = await c.execute({
    sql: "UPDATE teams SET professor_phone=?, professor_email=? WHERE professor_name=?",
    args: [phone, email, name],
  });
  console.log(name, "→", r.rowsAffected, "teams");
}

const rows = (await c.execute("SELECT id,name,professor_name,professor_phone,professor_email FROM teams ORDER BY id")).rows;
for (const t of rows) console.log(t.id, t.name, "|", t.professor_name, t.professor_phone || "-", t.professor_email || "-");
