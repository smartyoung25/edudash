// 교육사업과 무관한 "병행 사업" 메일 제외 규칙 — 제목/본문/첨부파일명 종합 판별.
//
// 배경: 코디·교수·내부 직원 이메일이 allowlist 에 있다 보니, 그들이 교육과 무관한
//       다른 사업 메일을 Fwd(전달)하면 그 첨부가 서류제출에 미분류로 오수집된다.
//
// 현재 대상:
//   - aT 스마트 수출전문단지 구축사업(컨설팅·운영 용역) — awake@/bsy@ 등이 사업계획서를 Fwd.
//     모든 제목/첨부명에 "수출전문단지" 가 들어가 식별이 명확하다.
//
// 새로운 무관 사업이 발견되면 키워드를 여기에 추가한다.
export function isUnrelatedBusiness(...texts: (string | null | undefined)[]): boolean {
  const hay = texts.filter(Boolean).join(" ");
  if (/수출전문단지/.test(hay)) return true; // aT 스마트 수출전문단지 구축사업
  return false;
}
