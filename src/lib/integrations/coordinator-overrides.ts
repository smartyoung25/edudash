// 운영 DB의 teams.coordinatorEmail이 비어 있어도 메일 수집·분류가 동작하도록
// 코드로 보강하는 추가 코디 매핑. 코디 추가 시 이 배열만 수정하면 됨.
// (운영 Turso 자격증명을 로컬에서 다룰 수 없어 코드+배포로 적용)
//
// 팀은 이름이 환경마다 다를 수 있어(예: "토마토7기", "딸기11 장성") 정확한 이름 대신
// 작목(product)/이름 일부(nameIncludes)로 매칭한다. 매칭 결과가 팀 1개로 유일할 때만 분류에 사용.

export type TeamMatch = { product?: string; nameIncludes?: string };

export const EXTRA_TEAM_COORDINATORS: { match: TeamMatch; emails: string[] }[] = [
  // 토마토 7기(BEST방토) — 코디 문유빈(ansdbqls544), 강사 문성욱(moonsw0617). 토마토 팀은 유일.
  { match: { product: "토마토" }, emails: ["ansdbqls544@naver.com", "moonsw0617@nate.com"] },
  // 배 1·2기 — 겸임 코디 조효창(banga4hc). 여기서는 수집 allowlist 보강용(EXTRA_COORDINATOR_EMAILS)일 뿐,
  // 배 팀이 2개(배1·배2)라 EXTRA_EMAIL_TO_MATCH 자동분류는 유일하지 않아 미적용 → 팀 분류는 제목/파일명 텍스트 별칭에 위임.
  { match: { product: "배" }, emails: ["banga4hc@naver.com"] },
];

// 평탄화: 추가 코디 이메일 전체 (소문자) — 수집 allowlist 보강용
export const EXTRA_COORDINATOR_EMAILS: string[] = EXTRA_TEAM_COORDINATORS.flatMap((t) =>
  t.emails.map((e) => e.toLowerCase()),
);

// 이메일(소문자) → 팀 매칭 기준 — 발신자 이메일로 팀 자동 분류용
export const EXTRA_EMAIL_TO_MATCH: Record<string, TeamMatch> = Object.fromEntries(
  EXTRA_TEAM_COORDINATORS.flatMap((t) => t.emails.map((e) => [e.toLowerCase(), t.match])),
);
