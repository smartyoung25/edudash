import Link from "next/link";
import { db, schema } from "@/db/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Plane, ReceiptText, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export default async function AgencyOverviewPage() {
  await requireRole(["admin"]);
  const all = await db.select().from(schema.agencyExpenses);

  const isReceipt = (e: typeof all[number]) => !e.docType || e.docType === "영수증";
  const buckets = {
    출장비: all.filter((e) => e.kind === "출장비" && isReceipt(e)),
    기타경비: all.filter((e) => e.kind === "기타경비" && isReceipt(e)),
  };

  const totals = {
    출장비: buckets.출장비.reduce((s, e) => s + e.totalAmount, 0),
    기타경비: buckets.기타경비.reduce((s, e) => s + e.totalAmount, 0),
  };
  const grand = totals.출장비 + totals.기타경비;

  const personalUnreimbursed = all
    .filter((e) => isReceipt(e) && e.cardType === "개인카드" && e.reimburseStatus !== "정산완료")
    .reduce((s, e) => s + e.totalAmount, 0);

  return (
    <div>
      <PageHeader
        title="기관경비"
        description="이암허브 본사 경비 — 팀과 무관한 출장비·기타경비 관리"
      />
      <div className="p-6 space-y-5">
        <Card className="p-4 flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">전체 합계</div>
            <div className="text-2xl font-bold tabular-nums">{fmt(grand)}원</div>
            <div className="text-xs text-muted-foreground mt-0.5">{all.length}건</div>
          </div>
          <div className="ml-auto text-sm">
            <span className="text-muted-foreground">개인카드 정산필요</span>{" "}
            <span className={personalUnreimbursed > 0 ? "font-bold text-orange-600" : "text-muted-foreground"}>
              {fmt(personalUnreimbursed)}원
            </span>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/agency/출장비" className="block">
            <Card className="p-5 hover:bg-muted/40 transition-colors">
              <div className="flex items-start gap-3">
                <Plane className="h-7 w-7 text-indigo-600" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">출장비</h3>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold tabular-nums mt-2">{fmt(totals.출장비)}원</div>
                  <div className="text-xs text-muted-foreground mt-1">{buckets.출장비.length}건</div>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/agency/기타경비" className="block">
            <Card className="p-5 hover:bg-muted/40 transition-colors">
              <div className="flex items-start gap-3">
                <ReceiptText className="h-7 w-7 text-gray-600" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">기타경비</h3>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold tabular-nums mt-2">{fmt(totals.기타경비)}원</div>
                  <div className="text-xs text-muted-foreground mt-1">{buckets.기타경비.length}건</div>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
