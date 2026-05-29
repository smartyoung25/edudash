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
import { AddExpenseDialog } from "../../add-expense-dialog";
import { DeleteExpenseButton } from "../../delete-button";
import { ReceiptViewer } from "../../receipt-viewer";
import { TeamReimburseButton } from "../../reimburse-button";
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

export default async function SessionCategoryPage({
  params,
}: {
  params: Promise<{ teamId: string; sessionNo: string; category: string }>;
}) {
  const session = await requireAuth();
  const { teamId: teamIdStr, sessionNo: sessionNoStr, category: categoryStr } = await params;
  const teamId = Number(teamIdStr);
  const category = decodeURIComponent(categoryStr);
  if (!Number.isFinite(teamId)) notFound();
  if (!CATEGORIES.includes(category as any)) notFound();

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
    .where(and(
      eq(schema.expenses.teamId, teamId),
      eq(schema.expenses.category, category as typeof CATEGORIES[number]),
      isNoneSession ? isNull(schema.expenses.sessionNo) : eq(schema.expenses.sessionNo, sessionNo as number),
    ))
    .orderBy(desc(schema.expenses.spentDate), desc(schema.expenses.id));

  const total = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.totalAmount : s), 0);
  const totalSupply = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.supplyAmount : s), 0);
  const totalVat = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.vatAmount : s), 0);
  const sessionLabel = isNoneSession ? "회차 미지정" : `${sessionNo}회차`;

  return (
    <div>
      <PageHeader
        title={`${sessionLabel} · ${category}`}
        description={`${teamRow.name} — 영수증 ${expenses.length}건`}
        actions={<AddExpenseDialog teamId={teamId} totalSessions={teamRow.totalSessions} />}
      />
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/expenses/${teamId}/${sessionNoStr}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />{sessionLabel}로
          </Link>
          <span className="text-muted-foreground">|</span>
          <Link href={`/expenses/${teamId}/category/${encodeURIComponent(category)}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            {category} 전체로
          </Link>
        </div>

        <Card className="p-4 flex items-center gap-3 flex-wrap">
          <Badge className={cn("border", PRODUCT_COLORS[teamRow.product as Product])}>{teamRow.product}</Badge>
          <Badge variant="outline">{teamRow.cohort}</Badge>
          <Badge>{sessionLabel}</Badge>
          <span className={cn("text-sm px-2 py-1 rounded border font-medium", CAT_COLORS[category])}>{category}</span>
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
              <div className="text-2xl font-bold text-emerald-600 tabular-nums">{fmt(total)}원</div>
            </div>
          </div>
        </Card>

        <div>
          <h3 className="text-sm font-semibold mb-2">영수증 내역 ({expenses.length}건)</h3>
          {expenses.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground text-sm">등록된 영수증이 없습니다.</Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">사용일</th>
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
                      <td className="px-3 py-2 tabular-nums">
                        {formatDate(e.spentDate)}
                        {excluded && (
                          <div className="mt-0.5 text-[10px] inline-block px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">{e.docType} · 합산제외</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{e.vendorName || "-"}</div>
                        {e.vendorCeo && <div className="text-xs text-muted-foreground">{e.vendorCeo} · {e.vendorType || "-"}</div>}
                        {e.memo && <div className="text-xs text-muted-foreground italic">{e.memo}</div>}
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {e.receiptFilePath && <ReceiptViewer expenseId={e.id} mimeType={e.receiptMimeType} />}
                          {(category === "강사비" || category === "퍼실리테이터비용") && (
                            <TeamReimburseButton id={e.id} status={e.reimburseStatus} note={e.reimburseNote} label="지급처리" />
                          )}
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
