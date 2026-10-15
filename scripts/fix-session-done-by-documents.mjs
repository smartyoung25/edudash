// import-education-status-260812.mjs 로 완료 처리된 회차 중 "오늘 이전 날짜"라서 안 걸러진 것들을 추가로 검증.
// 실제 수집된 문서(코디일지/출석부/교육생일지, documents 테이블 — 메일/드라이브로 이미 수집된 실제 파일)가
// 그 팀의 그 회차에 하나도 없으면, 완료라는 증거가 없는 것이므로 done -> planned로 되돌린다.
// (엑셀 원본 D드라이브가 접근 불가해 사용 — 이미 시스템에 들어와 있는 문서 수집 현황을 정답 소스로 삼음)
// 전체 회차(sessions row)는 절대 삭제/변경하지 않음, status만 정정.
// dry-run(기본): node scripts/fix-session-done-by-documents.mjs
// 실제 적용:     node scripts/fix-session-done-by-documents.mjs --apply
// 운영 DB:       node scripts/fix-session-done-by-documents.mjs --prod --apply
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");
const EVIDENCE_TYPES = ["코디일지", "출석부", "교육생일지"];

if (PROD) dotenv.config({ path: ".env.vercel.prod" });

const c = PROD
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: "file:./data/app.db" });

const teams = (await c.execute("SELECT id, name FROM teams ORDER BY id")).rows;

let totalRevert = 0, totalDrDelete = 0;
const perTeam = [];

for (const team of teams) {
  const sessions = (await c.execute({
    sql: "SELECT session_no, scheduled_date, status FROM sessions WHERE team_id=? ORDER BY session_no",
    args: [team.id],
  })).rows;

  const docRows = (await c.execute({
    sql: `SELECT DISTINCT session_no FROM documents WHERE team_id=? AND session_no IS NOT NULL AND doc_type IN (${EVIDENCE_TYPES.map(() => "?").join(",")})`,
    args: [team.id, ...EVIDENCE_TYPES],
  })).rows;
  const docSessions = new Set(docRows.map((r) => r.session_no));

  const toRevert = sessions.filter((s) => s.status === "done" && !docSessions.has(s.session_no));
  if (toRevert.length === 0) { perTeam.push({ team: team.name, total: sessions.length, revert: 0, drDelete: 0 }); continue; }

  let drDeleteCount = 0;
  for (const s of toRevert) {
    if (APPLY) {
      await c.execute({ sql: "UPDATE sessions SET status='planned' WHERE team_id=? AND session_no=?", args: [team.id, s.session_no] });
    }
    const drRows = (await c.execute({
      sql: "SELECT id FROM daily_reports WHERE team_id=? AND session_no=?",
      args: [team.id, s.session_no],
    })).rows;
    if (drRows.length > 0) {
      drDeleteCount += drRows.length;
      if (APPLY) {
        for (const r of drRows) await c.execute({ sql: "DELETE FROM daily_reports WHERE id=?", args: [r.id] });
      }
    }
  }

  perTeam.push({ team: team.name, total: sessions.length, revert: toRevert.length, sessionNos: toRevert.map((s) => s.session_no), drDelete: drDeleteCount });
  totalRevert += toRevert.length;
  totalDrDelete += drDeleteCount;
}

console.log(`=== ${APPLY ? "적용 완료" : "DRY RUN (실제 반영: --apply)"} — 증거(코디일지/출석부/교육생일지) 없는 done 회차 되돌리기 ===`);
for (const t of perTeam) {
  if (t.revert > 0) {
    console.log(`  ${t.team}: 총 ${t.total}차시 중 ${t.revert}건 원복(#${t.sessionNos.join(",")}), daily_reports ${t.drDelete}건 삭제`);
  }
}
console.log(`\n총 ${totalRevert}건 session 원복, ${totalDrDelete}건 daily_reports 삭제`);
