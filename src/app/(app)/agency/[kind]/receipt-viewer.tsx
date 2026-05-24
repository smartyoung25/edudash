"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon, FileText, Save, Loader2, Pencil, ImageOff } from "lucide-react";

export function AgencyReceiptViewer({
  expenseId,
  mimeType,
  docType,
  hasReceipt = true,
  initial,
}: {
  expenseId: number;
  mimeType?: string | null;
  docType?: string | null;
  hasReceipt?: boolean;
  initial?: {
    supplyAmount: number;
    vatAmount: number;
    totalAmount: number;
    vendorName: string | null;
    vendorBizNo: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState(() => ({
    supplyAmount: initial?.supplyAmount ?? 0,
    vatAmount: initial?.vatAmount ?? 0,
    totalAmount: initial?.totalAmount ?? 0,
    vendorName: initial?.vendorName ?? "",
    vendorBizNo: initial?.vendorBizNo ?? "",
  }));
  const [msg, setMsg] = useState<string | null>(null);

  const isPdf = mimeType === "application/pdf";
  const label = hasReceipt ? (docType && docType !== "영수증" ? docType : "영수증") : "수정";
  const Icon = hasReceipt ? ImageIcon : Pencil;

  function setNum(key: "supplyAmount" | "vatAmount" | "totalAmount", v: string) {
    const n = v === "" ? 0 : Math.max(0, Math.floor(Number(v) || 0));
    setForm((f) => {
      const next = { ...f, [key]: n };
      if (key === "supplyAmount" || key === "vatAmount") next.totalAmount = next.supplyAmount + next.vatAmount;
      return next;
    });
  }

  async function save() {
    setMsg(null);
    start(async () => {
      const res = await fetch("/api/agency-expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: expenseId, ...form }),
      });
      if (res.ok) {
        setMsg("저장됨");
        router.refresh();
        setTimeout(() => setOpen(false), 600);
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error || "저장 실패");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline ${hasReceipt ? "text-emerald-700 hover:text-emerald-900" : "text-slate-600 hover:text-slate-900"}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> 영수증 보기 / 금액 수정
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 좌: 영수증 이미지 또는 플레이스홀더 */}
            <div className="max-h-[70vh] min-h-[300px] overflow-auto bg-muted/20 rounded-md flex items-center justify-center">
              {hasReceipt ? (
                isPdf ? (
                  <iframe src={`/api/agency-expenses/${expenseId}/receipt`} className="w-full h-[70vh]" />
                ) : (
                  <img
                    src={`/api/agency-expenses/${expenseId}/receipt`}
                    alt="영수증"
                    className="max-w-full h-auto"
                  />
                )
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-12">
                  <ImageOff className="h-10 w-10 opacity-50" />
                  <div>영수증 미첨부</div>
                  <div className="text-xs">우측 폼에서 금액·거래처를 직접 입력하세요</div>
                </div>
              )}
            </div>

            {/* 우: 편집 폼 */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs">거래처 (상호)</Label>
                <Input
                  value={form.vendorName ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                  placeholder="예: 만성동코다리촌"
                />
              </div>
              <div>
                <Label className="text-xs">사업자번호</Label>
                <Input
                  value={form.vendorBizNo ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, vendorBizNo: e.target.value }))}
                  placeholder="123-45-67890"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">공급가</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={form.supplyAmount}
                    onChange={(e) => setNum("supplyAmount", e.target.value)}
                    className="text-right tabular-nums"
                  />
                </div>
                <div>
                  <Label className="text-xs">부가세</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={form.vatAmount}
                    onChange={(e) => setNum("vatAmount", e.target.value)}
                    className="text-right tabular-nums"
                  />
                </div>
                <div>
                  <Label className="text-xs">집행액(합계)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={form.totalAmount}
                    onChange={(e) => setNum("totalAmount", e.target.value)}
                    className="text-right tabular-nums font-semibold"
                  />
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground">
                공급가·부가세 입력 → 집행액 자동 합산. 합계를 따로 입력해 덮어쓸 수도 있습니다. 미리보기:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {form.supplyAmount.toLocaleString("ko-KR")} + {form.vatAmount.toLocaleString("ko-KR")} = {form.totalAmount.toLocaleString("ko-KR")}원
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button onClick={save} disabled={pending} size="sm" className="gap-1">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  저장
                </Button>
                {msg && <span className={`text-xs ${msg === "저장됨" ? "text-emerald-700" : "text-rose-600"}`}>{msg}</span>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
