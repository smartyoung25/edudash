"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, FileText, Save, Loader2, ImageOff, Pencil } from "lucide-react";

const CATEGORIES = ["주임강사수당", "퍼실리테이터수당", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] as const;
const DOC_TYPES = ["영수증", "거래명세표", "세금계산서"] as const;

export interface ReceiptViewerInitial {
  spentDate?: string | null;
  category?: string | null;
  vendorName?: string | null;
  vendorCeo?: string | null;
  vendorBizNo?: string | null;
  vendorType?: string | null;
  supplyAmount?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  memo?: string | null;
  docType?: string | null;
}

export function ReceiptViewer({
  expenseId,
  mimeType,
  triggerLabel,
  initial,
  editable = true,
}: {
  expenseId: number;
  mimeType?: string | null;
  triggerLabel?: string;
  initial?: ReceiptViewerInitial;
  editable?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const isPdf = mimeType === "application/pdf";
  const hasReceipt = true;

  const [form, setForm] = useState(() => ({
    spentDate: initial?.spentDate ?? "",
    category: initial?.category ?? "",
    vendorName: initial?.vendorName ?? "",
    vendorCeo: initial?.vendorCeo ?? "",
    vendorBizNo: initial?.vendorBizNo ?? "",
    supplyAmount: Number(initial?.supplyAmount ?? 0),
    vatAmount: Number(initial?.vatAmount ?? 0),
    totalAmount: Number(initial?.totalAmount ?? 0),
    memo: initial?.memo ?? "",
    docType: initial?.docType ?? "영수증",
  }));

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
      const res = await fetch("/api/expenses", {
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

  const Icon = editable && initial ? ImageIcon : ImageIcon;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 underline-offset-2 hover:underline"
        title="영수증 보기 / 금액 수정"
      >
        <Icon className="h-3.5 w-3.5" />
        {triggerLabel ?? "영수증"}
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
                  <iframe src={`/api/expenses/${expenseId}/receipt`} className="w-full h-[70vh]" />
                ) : (
                  <img
                    src={`/api/expenses/${expenseId}/receipt`}
                    alt="영수증"
                    className="max-w-full h-auto"
                  />
                )
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-12">
                  <ImageOff className="h-10 w-10 opacity-50" />
                  <div>영수증 미첨부</div>
                </div>
              )}
            </div>

            {/* 우: 편집 폼 */}
            {editable && initial ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">거래일자</Label>
                    <Input type="date" value={form.spentDate} onChange={(e) => setForm((f) => ({ ...f, spentDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">카테고리</Label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">거래처 (상호)</Label>
                  <Input
                    value={form.vendorName}
                    onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                    placeholder="예: 만성동코다리촌"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">대표자</Label>
                    <Input value={form.vendorCeo} onChange={(e) => setForm((f) => ({ ...f, vendorCeo: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">사업자번호</Label>
                    <Input
                      value={form.vendorBizNo}
                      onChange={(e) => setForm((f) => ({ ...f, vendorBizNo: e.target.value }))}
                      placeholder="123-45-67890"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">공급가</Label>
                    <Input
                      type="number" min={0} step={1}
                      value={form.supplyAmount}
                      onChange={(e) => setNum("supplyAmount", e.target.value)}
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">부가세</Label>
                    <Input
                      type="number" min={0} step={1}
                      value={form.vatAmount}
                      onChange={(e) => setNum("vatAmount", e.target.value)}
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">집행액(합계)</Label>
                    <Input
                      type="number" min={0} step={1}
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">증빙 종류</Label>
                    <Select value={form.docType} onValueChange={(v) => setForm((f) => ({ ...f, docType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">메모</Label>
                    <Textarea
                      value={form.memo}
                      onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                      rows={1}
                      className="min-h-[40px]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={save} disabled={pending} size="sm" className="gap-1">
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    저장
                  </Button>
                  {msg && <span className={`text-xs ${msg === "저장됨" ? "text-emerald-700" : "text-rose-600"}`}>{msg}</span>}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
