"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ScanLine, Loader2 } from "lucide-react";

const VENDOR_TYPES = ["개인사업자", "법인사업자"] as const;
const CARD_TYPES = ["기업카드", "기업법인카드", "NH법인카드", "개인카드"] as const;

export function AddAgencyDialog({ kind }: { kind: "출장비" | "기타경비" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [spentDate, setSpentDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplyAmount, setSupplyAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vendorType, setVendorType] = useState<string>("");
  const [vendorBizNo, setVendorBizNo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorCeo, setVendorCeo] = useState("");
  const [cardType, setCardType] = useState<string>("");
  const [cardLast4, setCardLast4] = useState("");
  const [payerName, setPayerName] = useState("");
  const [memo, setMemo] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  async function handleOcrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcrLoading(true);
    setError(null);
    setOcrRawText(null);
    setReceiptFile(file);
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
      if (p.cardType) setCardType(p.cardType);
      if (p.cardLast4) setCardLast4(p.cardLast4);
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
    setSupplyAmount(""); setVatAmount("");
    setVendorType(""); setVendorBizNo(""); setVendorName(""); setVendorCeo("");
    setCardType(""); setCardLast4(""); setPayerName("");
    setMemo(""); setError(null);
    setOcrRawText(null); setReceiptFile(null);
  }

  function submit() {
    setError(null);
    if (!spentDate) return setError("사용일을 입력해주세요");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("spentDate", spentDate);
      fd.append("supplyAmount", String(supply));
      fd.append("vatAmount", String(vat));
      if (vendorType) fd.append("vendorType", vendorType);
      fd.append("vendorBizNo", vendorBizNo);
      fd.append("vendorName", vendorName);
      fd.append("vendorCeo", vendorCeo);
      if (cardType) fd.append("cardType", cardType);
      fd.append("cardLast4", cardLast4);
      fd.append("payerName", payerName);
      fd.append("memo", memo);
      if (receiptFile) fd.append("receipt", receiptFile);

      const res = await fetch("/api/agency-expenses", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "저장 실패");
        return;
      }
      reset(); setOpen(false); router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />{kind} 추가</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{kind} 추가</DialogTitle></DialogHeader>
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
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowRawText((v) => !v)}>
                {showRawText ? "▼ OCR 원본 텍스트 숨기기" : "▶ OCR 원본 텍스트 보기"}
              </button>
              {showRawText && (
                <pre className="mt-2 text-[10px] leading-tight whitespace-pre-wrap max-h-40 overflow-y-auto bg-white border rounded p-2">{ocrRawText}</pre>
              )}
            </div>
          )}

          <div>
            <Label>사용일</Label>
            <Input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>공급가액</Label><Input type="number" value={supplyAmount} onChange={(e) => setSupplyAmount(e.target.value)} placeholder="0" /></div>
            <div><Label>부가세액</Label><Input type="number" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} placeholder="0" /></div>
            <div><Label>집행액</Label><Input value={total.toLocaleString("ko-KR")} disabled className="font-bold text-emerald-600" /></div>
          </div>
          <div className="pt-2 border-t">
            <Label className="text-xs text-muted-foreground">거래처</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div><Label className="text-xs">구분</Label>
                <Select value={vendorType} onValueChange={setVendorType}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{VENDOR_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">사업자번호</Label><Input value={vendorBizNo} onChange={(e) => setVendorBizNo(e.target.value)} placeholder="000-00-00000" /></div>
              <div><Label className="text-xs">거래처명</Label><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></div>
              <div><Label className="text-xs">대표자명</Label><Input value={vendorCeo} onChange={(e) => setVendorCeo(e.target.value)} /></div>
            </div>
          </div>
          <div className="pt-2 border-t">
            <Label className="text-xs text-muted-foreground">결제 정보</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div><Label className="text-xs">카드</Label>
                <Select value={cardType} onValueChange={setCardType}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{CARD_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">끝 4자리</Label><Input value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} placeholder="1234" maxLength={4} /></div>
              <div><Label className="text-xs">결제자(개인카드)</Label><Input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="홍길동" /></div>
            </div>
          </div>
          <div><Label className="text-xs">메모</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
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
