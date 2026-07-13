import Link from "next/link";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AddAgencyDialog } from "./add-agency-dialog";
import { requireRole } from "@/lib/auth";
import { getReceiptStatusMap } from "@/lib/receipt-status";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { KINDS, fmt, isReceiptDoc, groupByTrip } from "./agency-shared";
import { TripTable } from "./trip-table";

export const dynamic = "force-dynamic";

export default async function AgencyKindPage({ params }: { params: Promise<{ kind: string }> }) {
  await requireRole(["admin"]);
  const { kind: kindStr } = await params;
  const kind = decodeURIComponent(kindStr);
  if (!KINDS.includes(kind as any)) notFound();

  const [rows, teams] = await Promise.all([
    db.select().from(schema.agencyExpenses)
      .where(eq(schema.agencyExpenses.kind, kind as "출장비" | "기타경비"))
      .orderBy(desc(schema.agencyExpenses.spentDate), desc(schema.agencyExpenses.id)),
    db.select().from(schema.teams).orderBy(schema.teams.id),
  ]);

  const receiptStatus = await getReceiptStatusMap(rows);

  const receiptsOnly = rows.filter(isReceiptDoc);
  const total = receiptsOnly.reduce((s, e) => s + e.totalAmount, 0);
  const totalSupply = receiptsOnly.reduce((s, e) => s + e.supplyAmount, 0);
  const totalVat = receiptsOnly.reduce((s, e) => s + e.vatAmount, 0);
  const personalUnreimb = receiptsOnly.filter(r => r.cardType === "개인카드" && r.reimburseStatus !== "정산완료").reduce((s, e) => s + e.totalAmount, 0);
  const statementCount = rows.length - receiptsOnly.length;

  return (
    <div>
      <PageHeader
        title={`기관경비 — ${kind}`}
        description={`영수증 ${receiptsOnly.length}건 · 합계 ${fmt(total)}원${statementCount > 0 ? ` · 거래명세표/세금계산서 ${statementCount}건(합산 제외)` : ""}`}
        actions={<AddAgencyDialog kind={kind as "출장비" | "기타경비"} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />}
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
        ) : kind === "출장비" ? (
          <TeamCardGrid rows={rows} teams={teams} kind={kind} />
        ) : (
          <div className="space-y-4">
            {groupByTrip(rows).map((g) => (
              <TripTable key={g.key} kind={kind as "출장비" | "기타경비"} group={g} receiptStatus={receiptStatus} teams={teams} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function TeamCardGrid({
  rows,
  teams,
  kind,
}: {
  rows: (typeof schema.agencyExpenses.$inferSelect)[];
  teams: (typeof schema.teams.$inferSelect)[];
  kind: string;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t] as const));

  const byTeam = new Map<number | null, typeof rows>();
  for (const r of rows) {
    const tid = r.teamId ?? null;
    if (!byTeam.has(tid)) byTeam.set(tid, []);
    byTeam.get(tid)!.push(r);
  }

  const cards = Array.from(byTeam.entries()).map(([tid, teamRows]) => {
    const team = tid != null ? teamById.get(tid) : undefined;
    const total = teamRows.filter(isReceiptDoc).reduce((s, e) => s + e.totalAmount, 0);
    const tripCount = new Set(teamRows.map((r) => r.tripName ?? `__solo_${r.id}`)).size;
    return { teamId: tid, team, total, count: teamRows.length, tripCount };
  });

  cards.sort((a, b) => {
    if (a.teamId == null) return 1;
    if (b.teamId == null) return -1;
    return (a.team?.name ?? "").localeCompare(b.team?.name ?? "", "ko");
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Link key={c.teamId ?? "none"} href={`/agency/${encodeURIComponent(kind)}/${c.teamId ?? "none"}`} className="block">
          <Card className={cn("p-4 hover:bg-muted/40 transition-colors", c.teamId == null && "border-dashed")}>
            <div className="flex items-start gap-2 mb-2">
              {c.team ? (
                <>
                  <Badge className={cn("border", PRODUCT_COLORS[c.team.product as Product])}>{c.team.product}</Badge>
                  <Badge variant="outline">{c.team.cohort}</Badge>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">본사 공통</span>
              )}
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </div>
            <div className={cn("font-semibold mb-1", !c.team && "text-muted-foreground")}>{c.team?.name ?? "미지정"}</div>
            {c.team?.region && <div className="text-xs text-muted-foreground mb-2">{c.team.region}</div>}
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-bold tabular-nums">{fmt(c.total)}원</div>
              <div className="text-xs text-muted-foreground">{c.count}건 · 출장 {c.tripCount}건</div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
