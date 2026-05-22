// 거래명세표/세금계산서는 동일 거래의 보조 서류이므로 합계에서 제외한다.
// 카드영수증(매출표) 등 실제 결제증빙(=영수증)만 금액으로 집계한다.
export function countsTowardTotal(e: { docType?: string | null }): boolean {
  return !e.docType || e.docType === "영수증";
}

// 재료비 등은 회차 일정 중 사용일과 가장 가까운 회차에 자동 배정한다.
// 일정이 없거나 spentDate 파싱 실패 시 null 반환.
export function pickNearestSessionNo(
  spentDate: string | null | undefined,
  sessions: { sessionNo: number; scheduledDate: string }[],
): number | null {
  if (!spentDate || sessions.length === 0) return null;
  const t = Date.parse(spentDate);
  if (Number.isNaN(t)) return null;
  let best: { no: number; diff: number } | null = null;
  for (const s of sessions) {
    const st = Date.parse(s.scheduledDate);
    if (Number.isNaN(st)) continue;
    const diff = Math.abs(st - t);
    if (!best || diff < best.diff) best = { no: s.sessionNo, diff };
  }
  return best?.no ?? null;
}

// 모든 카테고리에 대해 회차 자동 배정을 시도한다.
// (sessionNo가 비어 있고 spentDate 파싱 가능, 팀 일정이 있을 때만 적용)
export const AUTO_SESSION_CATEGORIES: { has: (c: string) => boolean } = {
  has: () => true,
};


export function sumExpense<T extends { docType?: string | null }>(
  rows: T[],
  pick: (r: T) => number,
): number {
  let s = 0;
  for (const r of rows) if (countsTowardTotal(r)) s += pick(r);
  return s;
}
