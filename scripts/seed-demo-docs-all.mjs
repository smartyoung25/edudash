// 전 팀 데모 서류 시드 — 운영 시작 전 화면 검증용
// 규칙:
// - 출석부, 코디일지: 오늘 이전 진행된 차시 중 임의 70% 만 제출 (session_no 부여)
// - 경비영수증, 강사비지급확인서: 오늘 이전 월별로 1건씩 (session_no = null, "월별 N건"으로 표시)
// - 교육생일지: 30% 확률로 일부 차시에만 (희소함을 의도)
import { createClient } from "@libsql/client";

const TODAY = "2026-05-21";
const c = createClient({ url: "file:./data/app.db" });

// 시드 안정성 위해 deterministic random (Mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const teams = (await c.execute("SELECT id, name FROM teams ORDER BY id")).rows;
let total = 0;

for (const t of teams) {
  // 딸기17육묘(16)은 이미 손시드돼있어서 건드리지 않음
  if (t.id === 16) continue;

  const rng = mulberry32(t.id * 1000);
  const sessions = (await c.execute({
    sql: "SELECT session_no, scheduled_date FROM sessions WHERE team_id = ? ORDER BY session_no",
    args: [t.id],
  })).rows;
  const pastSessions = sessions.filter((s) => s.scheduled_date < TODAY);
  if (pastSessions.length === 0) continue;

  await c.execute({ sql: "DELETE FROM documents WHERE team_id = ?", args: [t.id] });

  const monthsTouched = new Set();
  for (const s of pastSessions) {
    monthsTouched.add(parseInt(s.scheduled_date.slice(5, 7), 10));

    // 출석부: 70% 확률
    if (rng() < 0.7) {
      const ymd = s.scheduled_date.replace(/-/g, "");
      await c.execute({
        sql: `INSERT INTO documents (team_id, doc_type, month, session_no, file_name, file_path, source, status, received_at)
              VALUES (?, '출석부', ?, ?, ?, ?, 'mail', 'submitted', datetime(?))`,
        args: [
          t.id,
          parseInt(s.scheduled_date.slice(5, 7), 10),
          s.session_no,
          `출석부_${t.name}_${s.session_no}차시_${ymd}.pdf`,
          `demo_drive_${t.id}_a${s.session_no}`,
          s.scheduled_date + "T15:00:00Z",
        ],
      });
      total++;
    }
    // 코디일지: 70% 확률
    if (rng() < 0.7) {
      await c.execute({
        sql: `INSERT INTO documents (team_id, doc_type, month, session_no, file_name, file_path, source, status, received_at)
              VALUES (?, '코디일지', ?, ?, ?, ?, ?, 'submitted', datetime(?))`,
        args: [
          t.id,
          parseInt(s.scheduled_date.slice(5, 7), 10),
          s.session_no,
          `코디일지_${t.name}_${s.session_no}차시.hwp`,
          `demo_drive_${t.id}_c${s.session_no}`,
          rng() < 0.5 ? "mail" : "manual",
          s.scheduled_date + "T17:00:00Z",
        ],
      });
      total++;
    }
    // 교육생일지: 30%
    if (rng() < 0.3) {
      await c.execute({
        sql: `INSERT INTO documents (team_id, doc_type, month, session_no, file_name, file_path, source, status, received_at)
              VALUES (?, '교육생일지', ?, ?, ?, ?, 'mail', 'submitted', datetime(?))`,
        args: [
          t.id,
          parseInt(s.scheduled_date.slice(5, 7), 10),
          s.session_no,
          `교육생일지_${t.name}_${s.session_no}차시.pdf`,
          `demo_drive_${t.id}_l${s.session_no}`,
          s.scheduled_date + "T18:00:00Z",
        ],
      });
      total++;
    }
  }

  // 경비영수증, 강사비: 월별 1건 (session_no NULL)
  for (const m of monthsTouched) {
    if (rng() < 0.8) {
      await c.execute({
        sql: `INSERT INTO documents (team_id, doc_type, month, file_name, file_path, source, status, received_at)
              VALUES (?, '경비영수증', ?, ?, ?, 'mail', 'submitted', datetime(?))`,
        args: [t.id, m, `경비_${t.name}_${m}월정산.xlsx`, `demo_drive_${t.id}_e${m}`, `2026-${String(m).padStart(2, "0")}-28T10:00:00Z`],
      });
      total++;
    }
    if (rng() < 0.7) {
      await c.execute({
        sql: `INSERT INTO documents (team_id, doc_type, month, file_name, file_path, source, status, received_at)
              VALUES (?, '강사비지급확인서', ?, ?, ?, 'mail', 'submitted', datetime(?))`,
        args: [t.id, m, `강사비_${t.name}_${m}월.xlsx`, `demo_drive_${t.id}_p${m}`, `2026-${String(m).padStart(2, "0")}-28T11:00:00Z`],
      });
      total++;
    }
  }
}

console.log(`데모 서류 ${total}건 시드 완료 (딸기17은 기존 데이터 유지)`);
