// classifier 동작 검증 — 별칭 + 차시 + 날짜 기반 추론
import { classifyTeam, detectSessionNo, classifyDocType, detectMonth, parseDatesFromText } from "../src/lib/integrations/classifier";

async function main() {
  const cases = [
    // 기존: 명시적 N차시
    { subject: "[한우해움] 3차시 출석부", body: "", filename: "출석부.pdf", from: "x@x.com", expect: { teamId: 29, sessionNo: 3 } },
    { subject: "혼디베리 - 7회차", body: "", filename: "교육생일지.pdf", from: "y@y.com", expect: { teamId: 19, sessionNo: 7 } },

    // 신규: 날짜 기반 (파일명에 8자리 YYYYMMDD)
    { subject: "딸기17육묘 출석부", body: "", filename: "출석부_딸기17_20260317.pdf", from: "a@a.com", expect: { teamId: 16, sessionNo: 1 } }, // 1차시=2026-03-17
    // 신규: 본문에 "3월 17일"
    { subject: "딸기육묘팀 출석부", body: "3월 17일 교육 첨부합니다", filename: "출석.pdf", from: "b@b.com", expect: { teamId: 16, sessionNo: 1 } },
    // 신규: 파일명 ISO
    { subject: "딸기17 출석", body: "", filename: "출석부_2026-04-29.pdf", from: "c@c.com", expect: { teamId: 16, sessionNo: 2 } }, // 2차시=2026-04-29
    // 신규: M/D 형식
    { subject: "딸기17 코디일지", body: "교육일: 4/29 (수)", filename: "코디.hwp", from: "d@d.com", expect: { teamId: 16, sessionNo: 2 } },
    // 신규: 가까운 매칭 (정확 매칭 없음 — 4/30이면 4/29 차시에 매칭)
    { subject: "딸기17 출석", body: "4월 30일 보강 출석부", filename: "출석.pdf", from: "e@e.com", expect: { teamId: 16, sessionNo: 2 } },
    // 신규: 점 구분자
    { subject: "감귤성장농 코디일지", body: "교육일자: 2026.04.10", filename: "코디.hwp", from: "f@f.com", expect: { teamId: 26, sessionNo: 3 } }, // 감귤6 3차시=4/10

    // 차시와 날짜가 다 있으면 차시가 우선
    { subject: "딸기17 5차시 출석", body: "원래 3/17 였음", filename: "출석.pdf", from: "g@g.com", expect: { teamId: 16, sessionNo: 5 } },
  ];

  console.log("=== parseDatesFromText 단위 테스트 ===");
  const dateSamples = [
    ["출석부_20260317.pdf", "2026"],
    ["교육일자: 2026-04-29", "2026"],
    ["3월 17일 교육", "2026"],
    ["4/29 진행", "2026"],
    ["26.04.10 출석", "2026"],
  ];
  for (const [s, y] of dateSamples) {
    console.log(`  "${s}" → [${parseDatesFromText(s, Number(y)).join(", ")}]`);
  }

  console.log("\n=== 종합 시나리오 ===");
  for (const t of cases) {
    const teamId = await classifyTeam({ fromAddress: t.from, subject: t.subject, body: t.body, fileName: t.filename });
    const sessionNo = await detectSessionNo({ teamId, subject: t.subject, body: t.body, fileName: t.filename, receivedAt: "2026-05-21T10:00:00Z" });
    const ok = teamId === t.expect.teamId && sessionNo === t.expect.sessionNo;
    console.log(`${ok ? "OK  " : "FAIL"} "${t.subject}" / "${t.filename}"`);
    if (!ok) console.log(`     team=${teamId}(expect ${t.expect.teamId}) sessionNo=${sessionNo}(expect ${t.expect.sessionNo})`);
  }
}
main();
