import { cn, formatDate } from "@/lib/utils";
import { AgencyReceiptViewer } from "./receipt-viewer";
import { DeleteAgencyButton } from "./delete-button";
import { ReimburseButton } from "./reimburse-button";
import { getReceiptStatusMap } from "@/lib/receipt-status";
import { SUBCAT_COLORS, fmt, type TripGroup } from "./agency-shared";
import type { schema } from "@/db/client";

type AgencyRow = typeof schema.agencyExpenses.$inferSelect;

export function TripTable({
  kind,
  group,
  receiptStatus,
  teams,
}: {
  kind: "출장비" | "기타경비";
  group: TripGroup<AgencyRow>;
  receiptStatus: Awaited<ReturnType<typeof getReceiptStatusMap>>;
  teams: { id: number; name: string }[];
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      {kind === "출장비" && group.tripName && (
        <div className="bg-emerald-50/50 px-4 py-2 border-b flex items-center gap-3">
          <span className="font-semibold text-sm">{group.tripName}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatDate(group.date)}</span>
          <span className="ml-auto text-sm">
            <span className="text-muted-foreground">소계 </span>
            <span className="font-bold tabular-nums text-emerald-700">{fmt(group.total)}원</span>
            <span className="text-xs text-muted-foreground ml-1">({group.rows.length}건)</span>
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
          {group.rows.map((e) => {
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
                      kind={kind}
                      teams={teams}
                      initial={{
                        spentDate: e.spentDate,
                        supplyAmount: e.supplyAmount,
                        vatAmount: e.vatAmount,
                        totalAmount: e.totalAmount,
                        vendorName: e.vendorName,
                        vendorBizNo: e.vendorBizNo,
                        tripName: e.tripName,
                        teamId: e.teamId,
                        memo: e.memo,
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
  );
}
