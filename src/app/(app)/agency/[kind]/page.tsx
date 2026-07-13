import Link from "next/link";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn, formatDate } from "@/lib/utils";
import { AddAgencyDialog } from "./add-agency-dialog";
import { DeleteAgencyButton } from "./delete-button";
import { AgencyReceiptViewer } from "./receipt-viewer";
import { ReimburseButton } from "./reimburse-button";
import { requireRole } from "@/lib/auth";
import { getReceiptStatusMap } from "@/lib/receipt-status";

export const dynamic = "force-dynamic";

const KINDS = ["출장비", "기타경비"] as const;
const SUBCAT_COLORS: Record<string, string> = {
  "일비":   "bg-slate-50 text-slate-700 border-slate-200",
  "식비":   "bg-amber-50 text-amber-700 border-amber-200",
  "교통비": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "숙박비": "bg-sky-50 text-sky-700 border-sky-200",
  "다과비": "bg-rose-50 text-rose-700 border-rose-200",
  "택시비": "bg-violet-50 text-violet-700 border-violet-200",
  "기타":   "bg-gray-100 text-gray-700 border-gray-200",
};
function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export default async function AgencyKindPage({ params }: { params: Promise<{ kind: string }> }) {
  await requireRole(["admin"]);
  const { kind: kindStr } = await params;
  const kind = decodeURIComponent(kindStr);
  if (!KINDS.includes(kind as any)) notFound();

  const [rows, teams] = await Promise.all([
    db.select().from(schema.agencyExpenses)
      .where(eq(schema.agencyExpenses.kind, kind as "출장비" | "기타경비"))
      .orderBy(desc(schema.agencyExpenses.spentDate), desc(schema.agencyExpenses.id)),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).orderBy(schema.teams.id),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t.name] as const));

  const receiptStatus = await getReceiptStatusMap(rows);

  const isReceipt = (r: typeof rows[number]) => !r.docType || r.docType === "영수증";
  const receiptsOnly = rows.filter(isReceipt);
  const total = receiptsOnly.reduce((s, e) => s + e.totalAmount, 0);
  const totalSupply = receiptsOnly.reduce((s, e) => s + e.supplyAmount, 0);
  const totalVat = receiptsOnly.reduce((s, e) => s + e.vatAmount, 0);
  const corp = receiptsOnly.filter(r => r.cardType === "기업카드").reduce((s, e) => s + e.totalAmount, 0);
  const personalUnreimb = receiptsOnly.filter(r => r.cardType === "개인카드" && r.reimburseStatus !== "정산완료").reduce((s, e) => s + e.totalAmount, 0);
  const statementCount = rows.length - receiptsOnly.length;

  // 출장비: 팀별 → (팀 안에서) 출장명(tripName)별로 그룹핑, 그 외(기타경비)는 단일 그룹
  type Row = typeof rows[number];
  type TripGroup = { key: string; tripName: string | null; date: string; rows: Row[]; total: number };
  type TeamGroup = { teamId: number | null; teamName: string; total: number; count: number; trips: TripGroup[] };
  const teamGroups: TeamGroup[] = [];

  if (kind === "출장비") {
    const byTeam = new Map<number | null, Row[]>();
    for (const r of rows) {
      const tid = r.teamId ?? null;
      if (!byTeam.has(tid)) byTeam.set(tid, []);
      byTeam.get(tid)!.push(r);
    }
    for (const [tid, teamRows] of byTeam) {
      const tripMap = new Map<string, Row[]>();
      for (const r of teamRows) {
        const key = r.tripName ?? `__solo_${r.id}`;
        if (!tripMap.has(key)) tripMap.set(key, []);
        tripMap.get(key)!.push(r);
      }
      const trips: TripGroup[] = [];
      for (const [key, rs] of tripMap) {
        const sub = rs.filter(isReceipt).reduce((s, x) => s + x.totalAmount, 0);
        const dates = rs.map((r) => r.spentDate).sort();
        trips.push({ key, tripName: rs[0].tripName, date: dates[0], rows: rs, total: sub });
      }
      trips.sort((a, b) => (a.date < b.date ? 1 : -1));
      const teamTotal = teamRows.filter(isReceipt).reduce((s, x) => s + x.totalAmount, 0);
      teamGroups.push({
        teamId: tid,
        teamName: tid != null ? (teamById.get(tid) ?? `팀#${tid}`) : "미지정 (본사 공통)",
        total: teamTotal,
        count: teamRows.length,
        trips,
      });
    }
    // 팀 배정된 그룹은 이름순, 미지정은 맨 뒤
    teamGroups.sort((a, b) => {
      if (a.teamId == null) return 1;
      if (b.teamId == null) return -1;
      return a.teamName.localeCompare(b.teamName, "ko");
    });
  } else {
    teamGroups.push({ teamId: null, teamName: "", total, count: rows.length, trips: [{ key: "all", tripName: null, date: "", rows, total }] });
  }

  return (
    <div>
      <PageHeader
        title={`기관경비 — ${kind}`}
        description={`영수증 ${receiptsOnly.length}건 · 합계 ${fmt(total)}원${statementCount > 0 ? ` · 거래명세표/세금계산서 ${statementCount}건(합산 제외)` : ""}`}
        actions={<AddAgencyDialog kind={kind as "출장비" | "기타경비"} teams={teams} />}
      />
      <div className="p-6 space-y-5">
        <Link href="/agency" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />기관경비 전체로
        </Link>

        <Card className="p-5 flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">공급가</div>
            <div className="font-bold tabular-nums">{fmt(totalSupply)}원</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">부가세</div>
            <div className="font-bold tabular-nums">{fmt(totalVat)}원</div>
          </div>
          <div className="border-l pl-6">
            <div className="text-xs text-muted-foreground">전체 사용금액</div>
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{fmt(total)}원</div>
          </div>
          <div className="ml-auto flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">개인카드 정산필요 </span>
              <span className={cn("font-bold tabular-nums", personalUnreimb > 0 ? "text-orange-600" : "text-muted-foreground")}>{fmt(personalUnreimb)}원</span>
            </div>
          </div>
        </Card>

        {rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            등록된 {kind} 내역이 없습니다. 우측 상단 "{kind} 추가"로 등록하세요.
          </Card>
        ) : (
          <div className="space-y-6">
            {teamGroups.map((tg) => (
              <div key={tg.teamId ?? "none"} className="space-y-3">
                {kind === "출장비" && (
                  <div className="flex items-center gap-3 px-1">
                    <h3 className={cn("text-base font-bold", tg.teamId == null && "text-muted-foreground")}>{tg.teamName}</h3>
                    <span className="text-sm">
                      <span className="text-muted-foreground">합계 </span>
                      <span className="font-bold tabular-nums text-emerald-700">{fmt(tg.total)}원</span>
                      <span className="text-xs text-muted-foreground ml-1">({tg.count}건)</span>
                    </span>
                  </div>
                )}
                <div className="space-y-4">
                {tg.trips.map((g) => (
              <div key={g.key} className="rounded-lg border overflow-hidden">
                {kind === "출장비" && g.tripName && (
                  <div className="bg-emerald-50/50 px-4 py-2 border-b flex items-center gap-3">
                    <span className="font-semibold text-sm">{g.tripName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDate(g.date)}</span>
                    <span className="ml-auto text-sm">
                      <span className="text-muted-foreground">소계 </span>
                      <span className="font-bold tabular-nums text-emerald-700">{fmt(g.total)}원</span>
                      <span className="text-xs text-muted-foreground ml-1">({g.rows.length}건)</span>
                    </span>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">사용일</th>
                      {kind === "출장비" && <th className="px-3 py-2 text-left">분류</th>}
                      <th className="px-3 py-2 text-left">거래처</th>
                      <th className="px-3 py-2 text-left">사업자번호</th>
                      <th className="px-3 py-2 text-left">결제</th>
                      <th className="px-3 py-2 text-right">공급가</th>
                      <th className="px-3 py-2 text-right">부가세</th>
                      <th className="px-3 py-2 text-right">집행액</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((e) => {
                      const isPerDiem = e.subcategory === "일비";
                      const excluded = !!(e.docType && e.docType !== "영수증");
                      return (
                      <tr key={e.id} className={cn("border-t hover:bg-muted/20", excluded && "bg-amber-50/30")}>
                        <td className="px-3 py-2 tabular-nums">
                          {formatDate(e.spentDate)}
                          {excluded && (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5">{e.docType}<br/>(합산 제외)</div>
                          )}
                        </td>
                        {kind === "출장비" && (
                          <td className="px-3 py-2">
                            {e.subcategory ? (
                              <span className={cn("text-[11px] px-1.5 py-0.5 rounded border", SUBCAT_COLORS[e.subcategory])}>{e.subcategory}</span>
                            ) : "-"}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <div className="font-medium">{e.vendorName || (isPerDiem ? <span className="text-muted-foreground italic">— 일비(계좌이체)</span> : "-")}</div>
                          {e.vendorCeo && <div className="text-xs text-muted-foreground">{e.vendorCeo} · {e.vendorType || "-"}</div>}
                          {e.memo && <div className="text-xs text-muted-foreground italic">{e.memo}</div>}
                          <div className="mt-1">
                            <AgencyReceiptViewer
                              expenseId={e.id}
                              mimeType={e.receiptMimeType}
                              docType={e.docType}
                              status={receiptStatus.get(e.id) ?? "none"}
                              kind={kind as "출장비" | "기타경비"}
                              teams={teams}
                              initial={{
                                supplyAmount: e.supplyAmount,
                                vatAmount: e.vatAmount,
                                totalAmount: e.totalAmount,
                                vendorName: e.vendorName,
                                vendorBizNo: e.vendorBizNo,
                                tripName: e.tripName,
                                teamId: e.teamId,
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-xs">{isPerDiem ? <span className="text-muted-foreground">—</span> : (e.vendorBizNo || "-")}</td>
                        <td className="px-3 py-2 text-xs">
                          {isPerDiem ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-700 border-slate-200">계좌이체</span>
                          ) : (!e.docType || e.docType === "영수증") ? (
                            <>
                              {e.cardType === "기업카드" && <span className="text-muted-foreground">-</span>}
                              {e.cardType === "기업법인카드" && (
                                <div className="inline-flex items-center gap-1 flex-wrap">
                                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                                    e.reimburseStatus === "정산완료" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-cyan-50 text-cyan-700 border-cyan-200")}>
                                    기업법인카드{e.cardLast4 ? ` ****${e.cardLast4}` : ""}{e.reimburseStatus === "정산완료" ? " · 정산✓" : " · 정산필요"}
                                  </span>
                                  <ReimburseButton id={e.id} apiPath="agency-expenses" status={e.reimburseStatus} note={e.reimburseNote} />
                                </div>
                              )}
                              {e.cardType === "NH법인카드" && (
                                <div className="inline-flex items-center gap-1 flex-wrap">
                                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                                    e.reimburseStatus === "정산완료" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-green-50 text-green-700 border-green-200")}>
                                    NH법인카드{e.cardLast4 ? ` ****${e.cardLast4}` : ""}{e.reimburseStatus === "정산완료" ? " · 정산✓" : " · 정산필요"}
                                  </span>
                                  <ReimburseButton id={e.id} apiPath="agency-expenses" status={e.reimburseStatus} note={e.reimburseNote} />
                                </div>
                              )}
                              {e.cardType === "개인카드" && (
                                <div className="inline-flex items-center gap-1 flex-wrap">
                                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                                    e.reimburseStatus === "정산완료" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-orange-50 text-orange-700 border-orange-200")}>
                                    개인카드 {e.payerName ?? ""}{e.reimburseStatus === "정산완료" ? " · 정산✓" : " · 정산필요"}
                                  </span>
                                  <ReimburseButton id={e.id} apiPath="agency-expenses" status={e.reimburseStatus} note={e.reimburseNote} />
                                </div>
                              )}
                              {!e.cardType && <span className="text-muted-foreground">-</span>}
                            </>
                          ) : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className={cn("px-3 py-2 tabular-nums text-right", isPerDiem && "text-muted-foreground")}>{isPerDiem ? "—" : fmt(e.supplyAmount)}</td>
                        <td className={cn("px-3 py-2 tabular-nums text-right", isPerDiem && "text-muted-foreground")}>{isPerDiem ? "—" : fmt(e.vatAmount)}</td>
                        <td className="px-3 py-2 tabular-nums text-right font-bold">{fmt(e.totalAmount)}</td>
                        <td className="px-2 py-2"><DeleteAgencyButton id={e.id} /></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
