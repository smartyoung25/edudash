import Link from "next/link";
import { db, schema } from "@/db/client";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AddAgencyDialog } from "../add-agency-dialog";
import { requireRole } from "@/lib/auth";
import { getReceiptStatusMap } from "@/lib/receipt-status";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { KINDS, fmt, isReceiptDoc, groupByTrip } from "../agency-shared";
import { TripTable } from "../trip-table";

export const dynamic = "force-dynamic";

export default async function AgencyTeamPage({
  params,
}: {
  params: Promise<{ kind: string; teamId: string }>;
}) {
  await requireRole(["admin"]);
  const { kind: kindStr, teamId: teamIdStr } = await params;
  const kind = decodeURIComponent(kindStr);
  if (!KINDS.includes(kind as any)) notFound();
  // 팀별 그룹핑은 출장비에만 의미가 있음 (기타경비는 팀과 무관한 본사 경비)
  if (kind !== "출장비") notFound();

  const isNone = teamIdStr === "none";
  const teamId = isNone ? null : Number(teamIdStr);
  if (!isNone && !Number.isFinite(teamId)) notFound();

  const [teamRow, teams] = await Promise.all([
    isNone ? Promise.resolve(undefined) : db.select().from(schema.teams).where(eq(schema.teams.id, teamId as number)).limit(1).then((r) => r[0]),
    db.select().from(schema.teams).orderBy(schema.teams.id),
  ]);
  if (!isNone && !teamRow) notFound();

  const rows = await db.select().from(schema.agencyExpenses)
    .where(and(
      eq(schema.agencyExpenses.kind, "출장비"),
      isNone ? isNull(schema.agencyExpenses.teamId) : eq(schema.agencyExpenses.teamId, teamId as number),
    ))
    .orderBy(desc(schema.agencyExpenses.spentDate), desc(schema.agencyExpenses.id));

  const receiptStatus = await getReceiptStatusMap(rows);

  const receiptsOnly = rows.filter(isReceiptDoc);
  const total = receiptsOnly.reduce((s, e) => s + e.totalAmount, 0);
  const totalSupply = receiptsOnly.reduce((s, e) => s + e.supplyAmount, 0);
  const totalVat = receiptsOnly.reduce((s, e) => s + e.vatAmount, 0);
  const personalUnreimb = receiptsOnly.filter(r => r.cardType === "개인카드" && r.reimburseStatus !== "정산완료").reduce((s, e) => s + e.totalAmount, 0);

  const label = teamRow?.name ?? "미지정 (본사 공통)";

  return (
    <div>
      <PageHeader
        title={`기관경비 — 출장비 · ${label}`}
        description={`영수증 ${receiptsOnly.length}건 · 합계 ${fmt(total)}원`}
        actions={<AddAgencyDialog kind="출장비" teams={teams.map((t) => ({ id: t.id, name: t.name }))} defaultTeamId={teamId ?? undefined} />}
      />
      <div className="p-6 space-y-5">
        <Link href="/agency/출장비" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />팀별 출장비로
        </Link>

        <Card className="p-5 flex items-center gap-6 flex-wrap">
          {teamRow && (
            <>
              <Badge className={cn("border", PRODUCT_COLORS[teamRow.product as Product])}>{teamRow.product}</Badge>
              <Badge variant="outline">{teamRow.cohort}</Badge>
              <h2 className="text-lg font-bold">{teamRow.name}</h2>
            </>
          )}
          {!teamRow && <h2 className="text-lg font-bold text-muted-foreground">미지정 (본사 공통)</h2>}
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
              <div className="text-2xl font-bold text-emerald-600 tabular-nums">{fmt(total)}원</div>
            </div>
            {personalUnreimb > 0 && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">개인카드 정산필요</div>
                <div className="font-bold tabular-nums text-orange-600">{fmt(personalUnreimb)}원</div>
              </div>
            )}
          </div>
        </Card>

        {rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">등록된 출장비 내역이 없습니다.</Card>
        ) : (
          <div className="space-y-4">
            {groupByTrip(rows).map((g) => (
              <TripTable key={g.key} kind="출장비" group={g} receiptStatus={receiptStatus} teams={teams} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
