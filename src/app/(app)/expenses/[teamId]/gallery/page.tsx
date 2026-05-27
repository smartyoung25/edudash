import Link from "next/link";
import { db, schema } from "@/db/client";
import { eq, desc, isNotNull, and } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn, formatDate } from "@/lib/utils";
import { ReceiptViewer } from "../receipt-viewer";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const CAT_COLORS: Record<string, string> = {
  "주임강사수당":   "bg-purple-50 text-purple-700 border-purple-200",
  "퍼실리테이터수당": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "식대":   "bg-amber-50 text-amber-700 border-amber-200",
  "다과":   "bg-rose-50 text-rose-700 border-rose-200",
  "재료비": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "숙박":   "bg-sky-50 text-sky-700 border-sky-200",
  "임차비": "bg-violet-50 text-violet-700 border-violet-200",
  "출장비": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "기타":   "bg-gray-100 text-gray-700 border-gray-200",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export default async function GalleryPage({ params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) notFound();
  if (isTeamScoped(session.role!) && session.teamId && session.teamId !== teamId) {
    redirect(`/expenses/${session.teamId}/gallery`);
  }

  const [teamRow] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  if (!teamRow) notFound();

  const expenses = await db.select().from(schema.expenses)
    .where(and(eq(schema.expenses.teamId, teamId), isNotNull(schema.expenses.receiptFilePath)))
    .orderBy(desc(schema.expenses.spentDate), desc(schema.expenses.id));

  return (
    <div>
      <PageHeader
        title="영수증 갤러리"
        description={`${teamRow.name} — 등록된 모든 영수증 원본 ${expenses.length}건`}
      />
      <div className="p-6 space-y-4">
        <Link href={`/expenses/${teamId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />{teamRow.name} 전체로
        </Link>

        <Card className="p-4 flex items-center gap-2 flex-wrap">
          <Badge className={cn("border", PRODUCT_COLORS[teamRow.product as Product])}>{teamRow.product}</Badge>
          <Badge variant="outline">{teamRow.cohort}</Badge>
          <h2 className="text-lg font-bold">{teamRow.name}</h2>
          <div className="ml-auto flex items-center gap-4 flex-wrap text-sm">
            {(() => {
              const personalUnreimbursed = expenses
                .filter((e) => e.cardType === "개인카드" && e.reimburseStatus !== "정산완료")
                .reduce((s, e) => s + e.totalAmount, 0);
              const corp = expenses.filter((e) => e.cardType === "기업카드").reduce((s, e) => s + e.totalAmount, 0);
              return (
                <>
                  <div className="text-xs">
                    <span className="text-muted-foreground">기업카드</span>{" "}
                    <span className="font-bold text-blue-700 tabular-nums">{fmt(corp)}원</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">개인카드 정산필요</span>{" "}
                    <span className={cn("font-bold tabular-nums", personalUnreimbursed > 0 ? "text-orange-600" : "text-muted-foreground")}>
                      {fmt(personalUnreimbursed)}원
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">영수증 {expenses.length}건</div>
                </>
              );
            })()}
          </div>
        </Card>

        {expenses.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            저장된 영수증 원본이 없습니다.
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {expenses.map((e) => (
              <Card key={e.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-[3/4] bg-muted/30 flex items-center justify-center overflow-hidden">
                  {e.receiptMimeType === "application/pdf" ? (
                    <div className="text-xs text-muted-foreground p-4 text-center">📄 PDF</div>
                  ) : (
                    <img
                      src={`/api/expenses/${e.id}/receipt`}
                      alt={e.vendorName || "영수증"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", CAT_COLORS[e.category])}>{e.category}</span>
                    {e.sessionNo && <span className="text-[10px] text-muted-foreground">{e.sessionNo}회차</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {e.cardType === "기업법인카드" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-medium">
                        기업법인카드 · 정산필요
                      </span>
                    )}
                    {e.cardType === "NH법인카드" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">
                        NH법인카드 · 정산필요
                      </span>
                    )}
                    {e.cardType === "개인카드" && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                        e.reimburseStatus === "정산완료"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-orange-50 text-orange-700 border-orange-200")}>
                        개인카드{e.reimburseStatus === "정산완료" ? " · 정산✓" : " · 정산필요"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium truncate">{e.vendorName || "(거래처 미인식)"}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(e.spentDate)}</div>
                  <div className="text-sm font-bold tabular-nums">{fmt(e.totalAmount)}원</div>
                  <ReceiptViewer
                    expenseId={e.id}
                    mimeType={e.receiptMimeType}
                    triggerLabel="크게 보기"
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
