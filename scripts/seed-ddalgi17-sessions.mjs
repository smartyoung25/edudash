// 딸기17육묘 (team_id=16) 차시 시드 — PDF 7페이지 교육일정표 기반
// 사용: node scripts/seed-ddalgi17-sessions.mjs
import { createClient } from "@libsql/client";

const TEAM_ID = 16;
const TEAM_NAME = "딸기17육묘";

const SESSIONS = [
  { no: 1, date: "2026-03-17", subject: "육묘 도구 소독 / 딸기 육묘 작기 및 생리 이해" },
  { no: 2, date: "2026-04-29", subject: "런너·자묘 관리와 육묘 환경 / 삽목 육묘, 화아 분화" },
  { no: 3, date: "2026-05-20", subject: "병해충 관리" },
  { no: 4, date: "2026-06-10", subject: "배지 소독 / 정식 전후 관리" },
  { no: 5, date: "2026-06-17", subject: "우수 육묘 선진지 방문 / 육묘 현장 진단" },
  { no: 6, date: "2026-07-15", subject: "교육생 농가 육묘 현장 진단" },
  { no: 7, date: "2026-08-05", subject: "교육생 농가 육묘 현장 진단 및 배지소독" },
  { no: 8, date: "2026-10-30", subject: "교육생 농가 육묘 현장 진단 / 정식상 준비 상태 진단" },
];

// 데모용 진행 데이터: 1·2차시는 시트로 들어온 것처럼 daily_reports 생성
const COMPLETED_DEMO = [
  { no: 1, date: "2026-03-17", attended: 9, absent: 0 },
  { no: 2, date: "2026-04-29", attended: 8, absent: 1, absentNames: "강민수", absentReason: "농장 사정" },
];

const c = createClient({ url: "file:./data/app.db" });

// 1) sessions 정리 후 재삽입
await c.execute({ sql: "DELETE FROM sessions WHERE team_id = ?", args: [TEAM_ID] });
for (const s of SESSIONS) {
  await c.execute({
    sql: "INSERT INTO sessions (team_id, session_no, subject, scheduled_date, status) VALUES (?, ?, ?, ?, 'planned')",
    args: [TEAM_ID, s.no, s.subject, s.date],
  });
}

// 2) 데모 진행 데이터
await c.execute({ sql: "DELETE FROM daily_reports WHERE team_id = ?", args: [TEAM_ID] });
for (const d of COMPLETED_DEMO) {
  const s = SESSIONS.find((x) => x.no === d.no);
  await c.execute({
    sql: `INSERT INTO daily_reports (team_id, session_no, report_date, subject, attended, absent, absent_names, absent_reason, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sheet')`,
    args: [TEAM_ID, d.no, d.date, s.subject, d.attended, d.absent, d.absentNames ?? null, d.absentReason ?? null],
  });
}

const cnt = await c.execute({ sql: "SELECT COUNT(*) as n FROM sessions WHERE team_id = ?", args: [TEAM_ID] });
const done = await c.execute({ sql: "SELECT COUNT(*) as n FROM daily_reports WHERE team_id = ?", args: [TEAM_ID] });
console.log(`${TEAM_NAME}: ${cnt.rows[0].n}차시 시드 완료, 진행 데모 ${done.rows[0].n}건`);
