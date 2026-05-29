import Link from "next/link";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { AddExpenseDialog } from "./add-expense-dialog";
import { BudgetDialog } from "./budget-dialog";
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

export default async function TeamExpensesPage({ params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) notFound();

  if (isTeamScoped(session.role!) && session.teamId && session.teamId !== teamId) {
    redirect(`/expenses/${session.teamId}`);
  }

  const [teamRow] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  if (!teamRow) notFound();

  const [expenses, budgetRows] = await Promise.all([
    db.select().from(schema.expenses).where(eq(schema.expenses.teamId, teamId)),
    db.select().from(schema.expenseBudgets).where(eq(schema.expenseBudgets.teamId, teamId)),
  ]);

  // 카테고리별 합계 (거래명세표/세금계산서 제외)
  const byCategory = new Map<string, number>();
  for (const c of CATEGORIES) byCategory.set(c, 0);
  for (const e of expenses) {
    if (!countsTowardTotal(e)) continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.totalAmount);
  }

  // 카테고리별 예산
  const budgetByCat: Record<string, number> = {};
  for (const c of CATEGORIES) budgetByCat[c] = 0;
  for (const b of budgetRows) budgetByCat[b.category] = b.amount;
  const totalBudget = Object.values(budgetByCat).reduce((s, n) => s + n, 0);

  const total = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.totalAmount : s), 0);
  const totalSupply = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.supplyAmount : s), 0);
  const totalVat = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.vatAmount : s), 0);

  return (
    <div>
      <PageHeader
        title="팀별정산"
        description={`${teamRow.name} 전체 사용금액 — 회차 클릭 시 상세 보기`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/expenses/${teamId}/gallery`}>
              <Button size="sm" variant="outline"><Images className="h-4 w-4 mr-1" />영수증 갤러리</Button>
            </Link>
            <BudgetDialog teamId={teamId} currentBudgets={budgetByCat} />
            <AddExpenseDialog teamId={teamId} totalSessions={teamRow.totalSessions} />
          </div>
        }
      />
      <div className="p-6 space-y-5">
        <Link href="/expenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />팀 목록
        </Link>

        {/* 전체 사용금액 요약 */}
        <Card className="p-5 flex items-center gap-3 flex-wrap">
          <Badge className={cn("border", PRODUCT_COLORS[teamRow.product as Product])}>{teamRow.product}</Badge>
          <Badge variant="outline">{teamRow.cohort}</Badge>
          <h2 className="text-xl font-bold">{teamRow.name}</h2>
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
              <div className="text-xs text-muted-foreground">전체 사용금액</div>
              <div className="text-3xl font-bold text-emerald-600 tabular-nums">{fmt(total)}원</div>
              <div className="text-[10px] text-muted-foreground">
                {expenses.length}건
                {totalBudget > 0 && ` · 예산 ${fmt(totalBudget)}원 (${Math.round((total / totalBudget) * 100)}%)`}
              </div>
            </div>
          </div>
        </Card>

        {/* 카테고리별 합계 — 클릭 시 카테고리별 회차 분포로 이동 */}
        <div>
          <h3 className="text-sm font-semibold mb-2">카테고리별 합계 <span className="text-xs text-muted-foreground font-normal">(카드를 클릭하면 회차별 분포로 이동)</span></h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {CATEGORIES.map((c) => {
              const used = byCategory.get(c) ?? 0;
              const budget = budgetByCat[c] ?? 0;
              const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
              const over = budget > 0 && used > budget;
              return (
                <Link key={c} href={`/expenses/${teamId}/category/${encodeURIComponent(c)}`} className="block">
                  <Card className="p-3 hover:bg-muted/40 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={cn("text-[11px] px-1.5 py-0.5 rounded border", CAT_COLORS[c])}>{c}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-lg font-bold tabular-nums">{fmt(used)}</div>
                    {budget > 0 ? (
                      <>
                        <div className={cn("text-[10px] mt-0.5", over ? "text-red-600 font-medium" : "text-muted-foreground")}>
                          / {fmt(budget)}원 ({pct}%)
                        </div>
                        <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full transition-all", over ? "bg-red-500" : "bg-emerald-500")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-muted-foreground mt-0.5">예산 미설정</div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
