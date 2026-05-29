import Link from "next/link";
import { db, schema } from "@/db/client";
import { eq, and, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { AddExpenseDialog } from "../../add-expense-dialog";
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

export default async function CategoryExpensesPage({
  params,
}: {
  params: Promise<{ teamId: string; name: string }>;
}) {
  const session = await requireAuth();
  const { teamId: teamIdStr, name: nameStr } = await params;
  const teamId = Number(teamIdStr);
  const category = decodeURIComponent(nameStr);
  if (!Number.isFinite(teamId)) notFound();
  if (!CATEGORIES.includes(category as any)) notFound();

  if (isTeamScoped(session.role!) && session.teamId && session.teamId !== teamId) {
    redirect(`/expenses/${session.teamId}`);
  }

  const [teamRow] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  if (!teamRow) notFound();

  const expenses = await db.select().from(schema.expenses)
    .where(and(eq(schema.expenses.teamId, teamId), eq(schema.expenses.category, category)))
    .orderBy(desc(schema.expenses.spentDate), desc(schema.expenses.id));

  const total = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.totalAmount : s), 0);
  const totalSupply = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.supplyAmount : s), 0);
  const totalVat = expenses.reduce((s, e) => (countsTowardTotal(e) ? s + e.vatAmount : s), 0);

  // 회차별 분포 (거래명세표는 합산 제외, count는 전체 포함)
  const bySession = new Map<number, { total: number; count: number }>();
  let noSessionTotal = 0;
  let noSessionCount = 0;
  for (const e of expenses) {
    const amt = countsTowardTotal(e) ? e.totalAmount : 0;
    if (e.sessionNo) {
      const cur = bySession.get(e.sessionNo) ?? { total: 0, count: 0 };
      bySession.set(e.sessionNo, { total: cur.total + amt, count: cur.count + 1 });
    } else {
      noSessionTotal += amt;
      noSessionCount += 1;
    }
  }
  const allSessionCards = Array.from({ length: teamRow.totalSessions }, (_, i) => {
    const no = i + 1;
    const entry = bySession.get(no) ?? { total: 0, count: 0 };
    return { no, total: entry.total, count: entry.count };
  });

  return (
    <div>
      <PageHeader
        title={`${category} 사용내역`}
        description={`${teamRow.name} — ${category} 회차별 사용금액`}
        actions={<AddExpenseDialog teamId={teamId} totalSessions={teamRow.totalSessions} />}
      />
      <div className="p-6 space-y-5">
        <Link href={`/expenses/${teamId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />{teamRow.name} 전체로
        </Link>

        {/* 카테고리 요약 */}
        <Card className="p-5 flex items-center gap-3 flex-wrap">
          <Badge className={cn("border", PRODUCT_COLORS[teamRow.product as Product])}>{teamRow.product}</Badge>
          <Badge variant="outline">{teamRow.cohort}</Badge>
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
              <div className="text-xs text-muted-foreground">{category} 사용금액</div>
              <div className="text-3xl font-bold text-emerald-600 tabular-nums">{fmt(total)}원</div>
              <div className="text-[10px] text-muted-foreground">{expenses.length}건</div>
            </div>
          </div>
        </Card>

        {/* 회차별 분포 */}
        <div>
          <h3 className="text-sm font-semibold mb-2">{category} — 회차별 사용금액 <span className="text-xs text-muted-foreground font-normal">(회차를 클릭하면 영수증 내역이 표시됩니다)</span></h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {allSessionCards.map(({ no, total: t, count }) => {
              const hasData = count > 0;
              return (
                <Link key={no} href={`/expenses/${teamId}/${no}/${encodeURIComponent(category)}`} className="block">
                  <Card className={cn("p-3 hover:bg-muted/40 transition-colors cursor-pointer", hasData ? "" : "opacity-60")}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">{no}회차</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className={cn("text-base font-bold tabular-nums", hasData ? "" : "text-muted-foreground")}>{fmt(t)}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{hasData ? `${count}건` : "없음"}</div>
                  </Card>
                </Link>
              );
            })}
            {noSessionCount > 0 && (
              <Link href={`/expenses/${teamId}/none/${encodeURIComponent(category)}`} className="block">
                <Card className="p-3 border-dashed hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">회차 미지정</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="text-base font-bold tabular-nums">{fmt(noSessionTotal)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{noSessionCount}건</div>
                </Card>
              </Link>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
