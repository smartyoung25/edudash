// 딸기17육묘 데모용 서류 데이터 — 실제 Drive 업로드를 모사
// fileId 는 Drive URL 의 일부 (https://drive.google.com/file/d/{ID}/view)
import { createClient } from "@libsql/client";

const TEAM_ID = 16;
const DOCS = [
  // 1차시 (3월 17일)
  { docType: "출석부", month: 3, fileName: "출석부_딸기17육묘_1차시_20260317.pdf", source: "mail", fileId: "1abcDEF_demo_attendance_s1" },
  { docType: "코디일지", month: 3, fileName: "코디일지_딸기17_1차시.hwp", source: "mail", fileId: "1abcDEF_demo_coord_s1" },
  // 2차시 (4월 29일)
  { docType: "출석부", month: 4, fileName: "출석부_딸기17육묘_2차시_20260429.pdf", source: "mail", fileId: "1abcDEF_demo_attendance_s2" },
  { docType: "코디일지", month: 4, fileName: "코디일지_딸기17_2차시.hwp", source: "manual", fileId: "1abcDEF_demo_coord_s2" },
  { docType: "강사비지급확인서", month: 4, fileName: "강사비_딸기17_4월.xlsx", source: "mail", fileId: "1abcDEF_demo_pay_apr" },
  // 월 단위 (차시 미매칭)
  { docType: "경비영수증", month: 3, fileName: "경비_딸기17_3월정산.xlsx", source: "mail", fileId: "1abcDEF_demo_exp_mar" },
  { docType: "경비영수증", month: 4, fileName: "경비_딸기17_4월정산.xlsx", source: "mail", fileId: "1abcDEF_demo_exp_apr" },
];

const c = createClient({ url: "file:./data/app.db" });
await c.execute({ sql: "DELETE FROM documents WHERE team_id = ?", args: [TEAM_ID] });
for (const d of DOCS) {
  await c.execute({
    sql: `INSERT INTO documents (team_id, doc_type, month, file_name, file_path, source, status, received_at)
          VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))`,
    args: [TEAM_ID, d.docType, d.month, d.fileName, d.fileId, d.source],
  });
}
console.log(`딸기17 데모 서류 ${DOCS.length}건 시드 완료`);
