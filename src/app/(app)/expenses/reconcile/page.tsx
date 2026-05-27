import { requireRole } from "@/lib/auth";
import { reconcileSummary } from "@/lib/integrations/card-reconcile";
import { UploadCsvButton } from "./upload-button";

export const dynamic = "force-dynamic";

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export default async function ReconcilePage() {
  await requireRole(["admin"]);
  const sum = await reconcileSummary();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">법인카드 ↔ 영수증 대사</h1>
          <p className="text-sm text-muted-foreground mt-1">카드사 명세서(CSV)를 업로드하면 날짜·금액·카드끝4자리로 영수증과 자동 매칭됩니다.</p>
        </div>
        <UploadCsvButton />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="매칭 완료" value={sum.totals.matched} tone="ok" />
        <Stat label="카드만 있음 (영수증 누락)" value={sum.totals.cardOnly} tone="warn" />
        <Stat label="영수증만 있음 (카드 매입 누락)" value={sum.totals.receiptOnly} tone="warn" />
      </div>

      <section>
        <h2 className="text-sm font-medium mb-2 text-rose-700">⚠ 카드만 있음 — 영수증을 찾아 매칭 또는 추가하세요</h2>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>거래일자</Th><Th>가맹점</Th><Th>금액</Th><Th>카드끝4</Th><Th>승인번호</Th></tr>
            </thead>
            <tbody>
              {sum.cardOnly.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">매칭 누락 카드 매입 없음</td></tr>}
              {sum.cardOnly.map((s) => (
                <tr key={s.id} className="border-t">
                  <Td>{s.txDate}</Td>
                  <Td>{s.vendorName ?? "-"}</Td>
                  <Td className="text-right tabular-nums">{fmt(s.amount)}</Td>
                  <Td>{s.cardLast4 ?? "-"}</Td>
                  <Td className="text-xs text-muted-foreground">{s.approvalNo ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2 text-amber-700">⚠ 영수증만 있음 — 카드 매입 매칭이 없는 법인카드 영수증</h2>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>일자</Th><Th>가맹점</Th><Th>금액</Th><Th>카드끝4</Th><Th>출처</Th></tr>
            </thead>
            <tbody>
              {sum.receiptOnly.expenses.length + sum.receiptOnly.agency.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">매칭 누락 영수증 없음</td></tr>
              )}
              {sum.receiptOnly.expenses.map((e) => (
                <tr key={`exp-${e.id}`} className="border-t">
                  <Td>{e.spentDate}</Td>
                  <Td>{e.vendorName ?? "-"}</Td>
                  <Td className="text-right tabular-nums">{fmt(e.totalAmount)}</Td>
                  <Td>{e.cardLast4 ?? "-"}</Td>
                  <Td>팀{e.teamId}</Td>
                </tr>
              ))}
              {sum.receiptOnly.agency.map((e) => (
                <tr key={`ag-${e.id}`} className="border-t">
                  <Td>{e.spentDate}</Td>
                  <Td>{e.vendorName ?? "-"}</Td>
                  <Td className="text-right tabular-nums">{fmt(e.totalAmount)}</Td>
                  <Td>{e.cardLast4 ?? "-"}</Td>
                  <Td>기관경비</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2 text-emerald-700">✓ 매칭 완료</h2>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>거래일자</Th><Th>가맹점</Th><Th>금액</Th><Th>카드끝4</Th><Th>매칭 영수증</Th><Th>신뢰도</Th></tr>
            </thead>
            <tbody>
              {sum.matched.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">매칭된 카드 매입 없음</td></tr>}
              {sum.matched.map((s) => (
                <tr key={s.id} className="border-t">
                  <Td>{s.txDate}</Td>
                  <Td>{s.vendorName ?? "-"}</Td>
                  <Td className="text-right tabular-nums">{fmt(s.amount)}</Td>
                  <Td>{s.cardLast4 ?? "-"}</Td>
                  <Td className="text-xs">{s.matchedExpenseId ? `팀별정산 #${s.matchedExpenseId}` : `기관경비 #${s.matchedAgencyExpenseId}`}</Td>
                  <Td className="text-right tabular-nums text-xs">{s.matchConfidence ? `${Math.round(s.matchConfidence * 100)}%` : "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-700" : "text-amber-700";
  return (
    <div className="border rounded-md p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value.toLocaleString("ko-KR")}</div>
    </div>
  );
}
