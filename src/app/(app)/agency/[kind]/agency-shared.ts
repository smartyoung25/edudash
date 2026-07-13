export const KINDS = ["출장비", "기타경비"] as const;

export const SUBCAT_COLORS: Record<string, string> = {
  "일비":   "bg-slate-50 text-slate-700 border-slate-200",
  "식비":   "bg-amber-50 text-amber-700 border-amber-200",
  "교통비": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "숙박비": "bg-sky-50 text-sky-700 border-sky-200",
  "다과비": "bg-rose-50 text-rose-700 border-rose-200",
  "택시비": "bg-violet-50 text-violet-700 border-violet-200",
  "기타":   "bg-gray-100 text-gray-700 border-gray-200",
};

export function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export function isReceiptDoc(r: { docType?: string | null }) {
  return !r.docType || r.docType === "영수증";
}

export interface TripGroup<Row> {
  key: string;
  tripName: string | null;
  date: string;
  rows: Row[];
  total: number;
}

// 출장명(tripName) 기준 그룹핑 — 없으면 건별 단독 그룹
export function groupByTrip<
  Row extends { id: number; tripName: string | null; spentDate: string; totalAmount: number; docType?: string | null },
>(rows: Row[]): TripGroup<Row>[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.tripName ?? `__solo_${r.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const groups: TripGroup<Row>[] = [];
  for (const [key, rs] of map) {
    const sub = rs.filter(isReceiptDoc).reduce((s, x) => s + x.totalAmount, 0);
    const dates = rs.map((r) => r.spentDate).sort();
    groups.push({ key, tripName: rs[0].tripName, date: dates[0], rows: rs, total: sub });
  }
  groups.sort((a, b) => (a.date < b.date ? 1 : -1));
  return groups;
}
