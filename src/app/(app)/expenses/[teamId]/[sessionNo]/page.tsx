import Link from "next/link";
import { db, schema } from "@/db/client";
import { eq, and, isNull, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn, formatDate } from "@/lib/utils";
import { AddExpenseDialog } from "../add-expense-dialog";
import { DeleteExpenseButton } from "../delete-button";
import { ReceiptViewer } from "../receipt-viewer";
import { TeamReimburseButton } from "../reimburse-button";
import { getReceiptStatusMap } from "@/lib/receipt-status";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";
import { countsTowardTotal } from "@/lib/expense";

export const dynamic = "force-dynamic";

const CATEGORIES = ["강사비", "퍼실리테이터비용", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] as const;
const CAT_COLORS: Record<string, string> = {
  "강사비":   "bg-purple-50 text-purple-700 border-purple-200",
  "퍼실리테이터비용": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "식대":   "bg-amber-50 text-amber-700 border-amber-200",
  "다과":   "bg-rose-50 text-rose-700 border-rose-200",
  "재료비": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "숙박":   "bg-sky-50 text-sky-700 border-sky-200",
  "임차비": "bg-violet-50 text-violet-700 border-violet-200",
  "출장비": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "기타":   "bg-gray-100 text-gray-700 border-gray-200",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export default async function SessionExpensesPage({
  params,
}: {
  params: Promise<{ teamId: string; sessionNo: string }>;
}) {
  const session = await requireAuth();
  const { teamId: teamIdStr, sessionNo: sessionNoStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) notFound();

  if (isTeamScoped(session.role!) && session.teamId && session.teamId !== teamId) {
    redirect(`/expenses/${session.teamId}`);
  }

  const [teamRow] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  if (!teamRow) notFound();

  const isNoneSession = sessionNoStr === "none";
  const sessionNo = isNoneSession ? null : Number(sessionNoStr);
  if (!isNoneSession && (!Number.isFinite(sessionNo) || (sessionNo as number) < 1 || (sessionNo as number) > teamRow.totalSessions)) {
    notFound();
  }

  const expenses = await db.select().from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.teamId, teamId),
        isNoneSession ? isNull(schema.expenses.sessionNo) : eq(schema.expenses.sessionNo, sessionNo as number)
      )
    )
    .orderBy(desc(schema.expenses.spentDate), desc(schema.expenses.id));

  const receiptStatus = await getReceiptStatusMap(expenses);

  const total = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.totalAmount : s), 0);
  const totalSupply = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.supplyAmount : s), 0);
  const totalVat = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.vatAmount : s), 0);

  const byCategory = new Map<string, number>();
  for (const c of CATEGORIES) byCategory.set(c, 0);
  for (const e of expenses) {
    if (!countsTowardTotal(e)) continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.totalAmount);
  }

  const sessionLabel = isNoneSession ? "회차 미지정" : `${sessionNo}회차`;

  return (
    <div>
      <PageHeader
        title={`${sessionLabel} 영수증`}
        description={`${teamRow.name} — ${sessionLabel} 지출 내역`}
        actions={<AddExpenseDialog teamId={teamId} totalSessions={teamRow.totalSessions} />}
      />
      <div className="p-6 space-y-5">
        <Link href={`/expenses/${teamId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />{teamRow.name} 전체로
        </Link>

        {/* 회차 요약 */}
        <Card className="p-5 flex items-center gap-3 flex-wrap">
          <Badge className={cn("border", PRODUCT_COLORS[teamRow.product as Product])}>{teamRow.product}</Badge>
          <Badge variant="outline">{teamRow.cohort}</Badge>
          <Badge>{sessionLabel}</Badge>
          <div className="ml-auto flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">공급가</div>
              <div className="font-bold tabular-nums">{fmt(totalSupply)}원</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">부가세</div>
              <div className="font-bold tabular-nums">{fmt(totalVat)}원</div>
            </div>
            <div className="text-right border-l pl-6">
              <div className="text-xs text-muted-foreground">사용금액</div>
              <div className="text-3xl font-bold text-emerald-600 tabular-nums">{fmt(total)}원</div>
              <div className="text-[10px] text-muted-foreground">{expenses.length}건</div>
            </div>
          </div>
        </Card>

        {/* 카테고리별 */}
        <div>
          <h3 className="text-sm font-semibold mb-2">카테고리별</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {CATEGORIES.map((c) => (
              <Card key={c} className="p-3">
                <div className={cn("text-[11px] inline-block px-1.5 py-0.5 rounded border mb-1.5", CAT_COLORS[c])}>{c}</div>
                <div className="text-lg font-bold tabular-nums">{fmt(byCategory.get(c) ?? 0)}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* 영수증 목록 */}
        <div>
          <h3 className="text-sm font-semibold mb-2">영수증 내역 ({expenses.length}건)</h3>
          {expenses.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              {sessionLabel}에 등록된 지출이 없습니다. 우측 상단 "지출 추가"로 등록하세요.
            </Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">사용일</th>
                    <th className="px-3 py-2 text-left">카테고리</th>
                    <th className="px-3 py-2 text-left">거래처</th>
                    <th className="px-3 py-2 text-left">사업자번호</th>
                    <th className="px-3 py-2 text-right">공급가</th>
                    <th className="px-3 py-2 text-right">부가세</th>
                    <th className="px-3 py-2 text-right">집행액</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => {
                    const excluded = !countsTowardTotal(e);
                    return (
                    <tr key={e.id} className={cn("border-t hover:bg-muted/20", excluded && "bg-amber-50/40")}>
                      <td className="px-3 py-2 tabular-nums">{formatDate(e.spentDate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={cn("text-[11px] px-1.5 py-0.5 rounded border", CAT_COLORS[e.category])}>{e.category}</span>
                          {excluded && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">{e.docType} · 합산제외</span>
                          )}
                          <TeamReimburseButton id={e.id} status={e.reimburseStatus} note={e.reimburseNote} verb={(e.category === "강사비" || e.category === "퍼실리테이터비용") ? "지급" : "정산"} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{e.vendorName || "-"}</div>
                        {e.vendorCeo && <div className="text-xs text-muted-foreground">{e.vendorCeo} · {e.vendorType || "-"}</div>}
                        {e.memo && <div className="text-xs text-muted-foreground italic">{e.memo}</div>}
                        <div className="mt-1">
                          <ReceiptViewer
                            expenseId={e.id}
                            mimeType={e.receiptMimeType}
                            status={receiptStatus.get(e.id) ?? "none"}
                            initial={{
                              spentDate: e.spentDate,
                              category: e.category,
                              vendorName: e.vendorName,
                              vendorCeo: e.vendorCeo,
                              vendorBizNo: e.vendorBizNo,
                              vendorType: e.vendorType,
                              supplyAmount: e.supplyAmount,
                              vatAmount: e.vatAmount,
                              totalAmount: e.totalAmount,
                              memo: e.memo,
                              docType: e.docType,
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">{e.vendorBizNo || "-"}</td>
                      <td className="px-3 py-2 tabular-nums text-right">{fmt(e.supplyAmount)}</td>
                      <td className="px-3 py-2 tabular-nums text-right">{fmt(e.vatAmount)}</td>
                      <td className={cn("px-3 py-2 tabular-nums text-right font-bold", excluded && "line-through text-muted-foreground font-normal")}>{fmt(e.totalAmount)}</td>
                      <td className="px-2 py-2"><DeleteExpenseButton id={e.id} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
