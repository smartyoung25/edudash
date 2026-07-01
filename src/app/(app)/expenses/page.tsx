import Link from "next/link";
import { db, schema } from "@/db/client";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Receipt, ChevronRight } from "lucide-react";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";
import { countsTowardTotal } from "@/lib/expense";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default async function ExpensesOverview() {
  const session = await requireAuth();

  // 팀 한정 역할은 본인 팀으로 바로 이동
  if (isTeamScoped(session.role!) && session.teamId) {
    redirect(`/expenses/${session.teamId}`);
  }

  const [teams, allExpenses, allBudgets] = await Promise.all([
    db.select().from(schema.teams),
    db.select().from(schema.expenses),
    db.select().from(schema.expenseBudgets),
  ]);

  const totalsByTeam = new Map<number, number>();
  const countByTeam = new Map<number, number>();
  for (const e of allExpenses) {
    countByTeam.set(e.teamId, (countByTeam.get(e.teamId) ?? 0) + 1);
    if (!countsTowardTotal(e)) continue; // 거래명세표/세금계산서는 합산 제외
    totalsByTeam.set(e.teamId, (totalsByTeam.get(e.teamId) ?? 0) + e.totalAmount);
  }
  const grandTotal = allExpenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.totalAmount : s), 0);

  // 팀별 예산 합계 (카테고리별 예산의 합) — 상세 페이지와 동일 계산
  const budgetByTeam = new Map<number, number>();
  for (const b of allBudgets) {
    budgetByTeam.set(b.teamId, (budgetByTeam.get(b.teamId) ?? 0) + b.amount);
  }
  const grandBudget = allBudgets.reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <PageHeader
        title="팀별정산"
        description="각 팀의 회차별 지출과 영수증 세부 내역을 관리합니다"
      />
      <div className="p-6 space-y-6">
        <Card className="p-4 flex items-center gap-3">
          <Receipt className="h-6 w-6 text-emerald-600" />
          <div>
            <div className="text-xs text-muted-foreground">전체 집행 합계</div>
            <div className="text-2xl font-bold tabular-nums">{fmt(grandTotal)}</div>
            {grandBudget > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                / 전체 예산 {fmt(grandBudget)} ({Math.round((grandTotal / grandBudget) * 100)}%)
              </div>
            )}
          </div>
          <div className="ml-auto text-sm text-muted-foreground">{allExpenses.length}건</div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => {
            const total = totalsByTeam.get(t.id) ?? 0;
            const cnt = countByTeam.get(t.id) ?? 0;
            const budget = budgetByTeam.get(t.id) ?? 0;
            const pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
            const over = budget > 0 && total > budget;
            return (
              <Link key={t.id} href={`/expenses/${t.id}`} className="block">
                <Card className="p-4 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start gap-2 mb-2">
                    <Badge className={cn("border", PRODUCT_COLORS[t.product as Product])}>{t.product}</Badge>
                    <Badge variant="outline">{t.cohort}</Badge>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="font-semibold mb-1">{t.name}</div>
                  <div className="text-xs text-muted-foreground mb-2">{t.region}</div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-lg font-bold tabular-nums">{fmt(total)}</div>
                    <div className="text-xs text-muted-foreground">{cnt}건</div>
                  </div>
                  {budget > 0 ? (
                    <>
                      <div className={cn("text-[11px] mt-1 tabular-nums", over ? "text-red-600 font-medium" : "text-muted-foreground")}>
                        / 예산 {fmt(budget)} ({pct}%)
                      </div>
                      <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full", over ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-muted-foreground mt-1">예산 미설정</div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
