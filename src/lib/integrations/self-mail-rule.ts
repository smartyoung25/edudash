// stepup2(메일함 본인) 발신 메일 수집/정리 공통 규칙.
// 딸기 11기(장성) 관련 메일인지 판별 — 분류된 팀명/제목/본문/파일명 종합.
export function isJangseongStrawberry(...texts: (string | null | undefined)[]): boolean {
  const hay = texts.filter(Boolean).join(" ");
  if (/장성/.test(hay)) return true; // 지역명(이 팀 고유)
  if (/딸기\s*11(?!\d)/.test(hay)) return true; // "딸기11", "딸기 11"
  if (/딸기/.test(hay) && /(?<!\d)11\s*기/.test(hay)) return true; // "딸기 … 11기"
  return false;
}
