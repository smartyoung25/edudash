// import-education-status-260812.mjs 실행 후 발견된 버그 수정:
// 엑셀 회색칸(코디일지 없어 계획일을 그대로 적어둔 값)까지 "완료"로 잘못 표시된 것을 되돌림.
// 전체 회차(sessions row)는 그대로 두고, 오늘(TODAY) 이후 날짜인 회차만 done->planned로 되돌리고
// 그 회차에 새로 생긴 daily_reports(source='sheet')를 삭제한다.
// dry-run(기본): node scripts/fix-future-session-status.mjs
// 실제 적용:     node scripts/fix-future-session-status.mjs --apply
// 운영 DB:       node scripts/fix-future-session-status.mjs --prod --apply
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");
const TODAY = new Date().toISOString().slice(0, 10);

if (PROD) dotenv.config({ path: ".env.vercel.prod" });

const c = PROD
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: "file:./data/app.db" });

console.log(`오늘 기준일: ${TODAY}`);

const futureDoneSessions = await c.execute({
  sql: "SELECT s.id, s.team_id, t.name AS team_name, s.session_no, s.scheduled_date FROM sessions s JOIN teams t ON t.id = s.team_id WHERE s.status='done' AND s.scheduled_date > ? ORDER BY t.name, s.session_no",
  args: [TODAY],
});
console.log(`\n미래 날짜인데 완료 처리된 session: ${futureDoneSessions.rows.length}건`);
for (const r of futureDoneSessions.rows.slice(0, 30)) {
  console.log(`  [${r.team_name}] session#${r.session_no} ${r.scheduled_date}`);
}
if (futureDoneSessions.rows.length > 30) console.log(`  ... 외 ${futureDoneSessions.rows.length - 30}건`);

const futureSheetReports = await c.execute({
  sql: "SELECT dr.id, dr.team_id, t.name AS team_name, dr.session_no, dr.report_date FROM daily_reports dr JOIN teams t ON t.id = dr.team_id WHERE dr.source='sheet' AND dr.report_date > ? ORDER BY t.name, dr.session_no",
  args: [TODAY],
});
console.log(`\n미래 날짜로 잘못 들어간 daily_reports(source=sheet): ${futureSheetReports.rows.length}건`);
for (const r of futureSheetReports.rows.slice(0, 30)) {
  console.log(`  [${r.team_name}] session#${r.session_no} ${r.report_date}`);
}
if (futureSheetReports.rows.length > 30) console.log(`  ... 외 ${futureSheetReports.rows.length - 30}건`);

if (APPLY) {
  for (const r of futureDoneSessions.rows) {
    await c.execute({ sql: "UPDATE sessions SET status='planned' WHERE id=?", args: [r.id] });
  }
  for (const r of futureSheetReports.rows) {
    await c.execute({ sql: "DELETE FROM daily_reports WHERE id=?", args: [r.id] });
  }
  console.log(`\n적용 완료: session ${futureDoneSessions.rows.length}건 원복, daily_reports ${futureSheetReports.rows.length}건 삭제`);
} else {
  console.log(`\nDRY RUN — 실제 반영하려면 --apply 추가`);
}
