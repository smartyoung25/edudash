// 중간만족도 조사 설문 1건 시드 (상태 open). 로컬 DATABASE_URL 또는 Turso 환경변수 사용.
import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./data/app.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });

const TITLE = "[2026 성장농 맞춤형과정] 교육 중간만족도 조사";
const DESC = [
  "안녕하세요. 2026 성장농 맞춤형과정에 참여해 주셔서 감사합니다.",
  "본 설문은 지금까지 진행된 교육에 대한 만족도를 점검하고, 남은 회차의 운영을 개선하기 위한 것입니다.",
  "응답 내용은 개인을 식별하지 않으며(작목·팀만 표기), 교육 개선 목적으로만 활용됩니다. 솔직한 의견 부탁드립니다.",
].join("\n");

const Q = [
  // section, qType, label, required
  ["강사", "scale5", "강사는 교육 주제에 대한 전문성을 갖추고 있다.", 1],
  ["강사", "scale5", "강사의 설명은 이해하기 쉽고 명확했다.", 1],
  ["강사", "scale5", "강사는 질문에 성실히 답변하고 소통하였다.", 1],
  ["강사", "scale5", "강사는 현장(농가) 상황에 맞는 실질적인 내용을 전달하였다.", 1],
  ["강사", "scale5", "강의 진행(시간 관리·자료 준비)이 충실하였다.", 1],
  ["운영", "scale5", "교육 일정 및 회차 안내가 사전에 충분히 이루어졌다.", 1],
  ["운영", "scale5", "교육 장소·환경(시설·기자재)이 교육에 적절하였다.", 1],
  ["운영", "scale5", "코디네이터·운영진의 안내와 지원이 원활하였다.", 1],
  ["운영", "scale5", "신청·출석 등 행정 절차가 편리하였다.", 1],
  ["운영", "scale5", "교육 시간과 횟수가 적절하였다.", 1],
  ["교육주제 및 내용", "scale5", "교육 주제가 내 영농(작목)에 도움이 되었다.", 1],
  ["교육주제 및 내용", "scale5", "교육 내용의 수준(난이도)이 적절하였다.", 1],
  ["교육주제 및 내용", "scale5", "이론과 실습(현장교육)의 구성이 균형 있었다.", 1],
  ["교육주제 및 내용", "scale5", "교육 내용을 실제 영농 현장에 적용할 수 있다.", 1],
  ["교육주제 및 내용", "scale5", "전반적으로 이번 교육 과정에 만족한다.", 1],
  ["개선사항 및 추가요청", "long", "이번 교육에서 가장 만족스러웠던 점은 무엇입니까?", 0],
  ["개선사항 및 추가요청", "long", "개선이 필요한 점(강사·운영·내용 등)은 무엇입니까?", 0],
  ["개선사항 및 추가요청", "long", "남은 회차에서 추가로 다루었으면 하는 주제·내용이 있다면 적어주세요.", 0],
  ["개선사항 및 추가요청", "long", "강사·운영 관련 건의사항이 있다면 자유롭게 적어주세요.", 0],
  ["개선사항 및 추가요청", "long", "기타 요청사항(시간대·장소·교재·실습 방식 등)이 있다면 적어주세요.", 0],
];

const now = new Date().toISOString();
const token = randomUUID();

const ins = await client.execute({
  sql: `INSERT INTO surveys (title, description, status, public_token, collect_team, created_by, created_by_name, created_at, updated_at)
        VALUES (?, ?, 'open', ?, 1, NULL, '시드', ?, ?)`,
  args: [TITLE, DESC, token, now, now],
});
const surveyId = Number(ins.lastInsertRowid);

for (let i = 0; i < Q.length; i++) {
  const [section, qType, label, required] = Q[i];
  await client.execute({
    sql: `INSERT INTO survey_questions (survey_id, sort_order, section, q_type, label, required, options, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    args: [surveyId, i, section, qType, label, required, now],
  });
}

console.log(`✓ 시드 완료: surveyId=${surveyId}, 공개링크=/s/${token}`);
process.exit(0);
