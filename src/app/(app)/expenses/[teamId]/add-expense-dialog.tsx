"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ScanLine, Loader2 } from "lucide-react";

const CATEGORIES = ["강사비", "퍼실리테이터비용", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] as const;
const VENDOR_TYPES = ["개인사업자", "법인사업자"] as const;
const DOC_TYPES = ["영수증", "거래명세표", "세금계산서"] as const;

export function AddExpenseDialog({ teamId, totalSessions }: { teamId: number; totalSessions: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [spentDate, setSpentDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionNo, setSessionNo] = useState("");
  const [category, setCategory] = useState<string>("");
  const [supplyAmount, setSupplyAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vendorType, setVendorType] = useState<string>("");
  const [vendorBizNo, setVendorBizNo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorCeo, setVendorCeo] = useState("");
  const [memo, setMemo] = useState("");
  const [docType, setDocType] = useState<string>("영수증");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  async function handleOcrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcrLoading(true);
    setError(null);
    setOcrRawText(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/expenses/ocr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "OCR 실패");
        return;
      }
      const p = data.parsed;
      if (p.spentDate) setSpentDate(p.spentDate);
      if (p.vendorName) setVendorName(p.vendorName);
      if (p.vendorCeo) setVendorCeo(p.vendorCeo);
      if (p.vendorBizNo) setVendorBizNo(p.vendorBizNo);
      if (p.vendorType) setVendorType(p.vendorType);
      if (p.supplyAmount) setSupplyAmount(String(p.supplyAmount));
      if (p.vatAmount) setVatAmount(String(p.vatAmount));
      if (p.rawText) setOcrRawText(p.rawText);
    } catch (err: any) {
      setError(err?.message || "OCR 실패");
    } finally {
      setOcrLoading(false);
    }
  }

  const supply = Number(supplyAmount) || 0;
  const vat = Number(vatAmount) || 0;
  const total = supply + vat;

  function reset() {
    setSpentDate(new Date().toISOString().slice(0, 10));
    setSessionNo("");
    setCategory("");
    setSupplyAmount("");
    setVatAmount("");
    setVendorType("");
    setVendorBizNo("");
    setVendorName("");
    setVendorCeo("");
    setMemo("");
    setDocType("영수증");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!category) return setError("카테고리를 선택해주세요");
    if (!spentDate) return setError("사용일을 입력해주세요");

    startTransition(async () => {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId, spentDate, sessionNo: sessionNo || null, category,
          supplyAmount: supply, vatAmount: vat,
          vendorType: vendorType || null,
          vendorBizNo, vendorName, vendorCeo, memo, docType,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "저장 실패");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />지출 추가</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>지출 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* 영수증 사진 업로드 → OCR 자동 입력 */}
          <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-emerald-200 bg-emerald-50/50 px-3 py-3 text-sm text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors">
            {ocrLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                영수증 인식 중...
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" />
                영수증 사진/PDF 업로드 → 자동 입력
              </>
            )}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleOcrUpload} disabled={ocrLoading} />
          </label>

          {ocrRawText && (
            <div className="rounded-md border bg-muted/30 p-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowRawText((v) => !v)}
              >
                {showRawText ? "▼ OCR 원본 텍스트 숨기기" : "▶ OCR 원본 텍스트 보기 (파싱이 잘 안 됐을 때 확인)"}
              </button>
              {showRawText && (
                <pre className="mt-2 text-[10px] leading-tight whitespace-pre-wrap max-h-40 overflow-y-auto bg-white border rounded p-2">{ocrRawText}</pre>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>사용일</Label>
              <Input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} />
            </div>
            <div>
              <Label>회차 (선택)</Label>
              <Select value={sessionNo} onValueChange={setSessionNo}>
                <SelectTrigger><SelectValue placeholder="회차 선택" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: totalSessions }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}회차</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>카테고리</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>서류유형</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              {docType !== "영수증" && (
                <div className="text-[10px] text-amber-700 mt-1">합산에 포함되지 않습니다</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>공급가액</Label>
              <Input type="number" value={supplyAmount} onChange={(e) => setSupplyAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>부가세액</Label>
              <Input type="number" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>집행액</Label>
              <Input value={total.toLocaleString("ko-KR")} disabled className="font-bold text-emerald-600" />
            </div>
          </div>
          <div className="pt-2 border-t">
            <Label className="text-xs text-muted-foreground">거래처 정보</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label className="text-xs">구분</Label>
                <Select value={vendorType} onValueChange={setVendorType}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">사업자등록번호</Label>
                <Input value={vendorBizNo} onChange={(e) => setVendorBizNo(e.target.value)} placeholder="000-00-00000" />
              </div>
              <div>
                <Label className="text-xs">거래처명</Label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">대표자명</Label>
                <Input value={vendorCeo} onChange={(e) => setVendorCeo(e.target.value)} />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs">메모</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={submit} disabled={isPending}>{isPending ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
