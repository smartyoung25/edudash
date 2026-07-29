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
// Vercel 서버리스 body 한도(~4.5MB)를 고려한 안전 상한 — 서버(/api/expenses, /api/expenses/ocr)와 동일한 값
const MAX_SIZE = 4 * 1024 * 1024;

export interface SessionOption {
  sessionNo: number;
  subject: string;
}

export function AddExpenseDialog({ teamId, sessions }: { teamId: number; sessions: SessionOption[] }) {
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [ocrNote, setOcrNote] = useState<string | null>(null);

  async function handleOcrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setOcrNote(null);
    setOcrRawText(null);
    if (file.size > MAX_SIZE) {
      // 서버(저장/OCR) 모두 이 크기를 넘으면 실패하므로, 첨부 전에 바로 안내하고 첨부하지 않음
      setOcrNote("파일이 너무 큽니다(최대 4MB). 사진 용량을 줄여 다시 첨부해주세요.");
      return;
    }
    // 업로드한 파일은 영수증으로 첨부(저장)됨 — OCR 자동입력은 보조 기능
    setReceiptFile(file);
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/expenses/ocr", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // OCR 실패해도 첨부는 유지 — 사용자가 직접 입력하면 됨
        setOcrNote("자동입력은 실패했지만 영수증은 첨부됩니다. 항목을 직접 입력해 주세요.");
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
      // OCR이 양식을 인식했으면(예: 강사비 수당지급확인서) 카테고리 자동 반영 — 사용자가 이미 고른 값은 덮어쓰지 않음
      if (!category && data.classification?.category && data.classification.confidence >= 0.65) {
        setCategory(data.classification.category);
      }
    } catch {
      setOcrNote("자동입력은 실패했지만 영수증은 첨부됩니다. 항목을 직접 입력해 주세요.");
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
    setReceiptFile(null);
    setOcrNote(null);
    setOcrRawText(null);
  }

  // 같은 회차에 강사가 2~3명일 수 있어, 저장 후 회차·사용일·카테고리는 유지하고
  // 거래처·금액·영수증만 비워 다음 사람을 바로 입력할 수 있게 한다.
  function partialReset() {
    setSupplyAmount("");
    setVatAmount("");
    setVendorType("");
    setVendorBizNo("");
    setVendorName("");
    setVendorCeo("");
    setMemo("");
    setReceiptFile(null);
    setOcrNote(null);
    setOcrRawText(null);
    setError(null);
  }

  function submit(continueAdding = false) {
    setError(null);
    if (!category) return setError("카테고리를 선택해주세요");
    if (!spentDate) return setError("사용일을 입력해주세요");

    startTransition(async () => {
      try {
        let res: Response;
        if (receiptFile) {
          // 영수증 파일 첨부 → multipart 전송 (서버가 Drive 업로드)
          const fd = new FormData();
          fd.append("receipt", receiptFile);
          fd.append("teamId", String(teamId));
          fd.append("spentDate", spentDate);
          if (sessionNo) fd.append("sessionNo", sessionNo);
          fd.append("category", category);
          fd.append("supplyAmount", String(supply));
          fd.append("vatAmount", String(vat));
          if (vendorType) fd.append("vendorType", vendorType);
          fd.append("vendorBizNo", vendorBizNo);
          fd.append("vendorName", vendorName);
          fd.append("vendorCeo", vendorCeo);
          fd.append("memo", memo);
          fd.append("docType", docType);
          res = await fetch("/api/expenses", { method: "POST", body: fd });
        } else {
          res = await fetch("/api/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId, spentDate, sessionNo: sessionNo || null, category,
              supplyAmount: supply, vatAmount: vat,
              vendorType: vendorType || null,
              vendorBizNo, vendorName, vendorCeo, memo, docType,
            }),
          });
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "저장 실패");
          return;
        }
        router.refresh();
        if (continueAdding) {
          partialReset(); // 회차·사용일·카테고리 유지 → 다음 강사 바로 입력
        } else {
          reset();
          setOpen(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
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

          {receiptFile && (
            <div className="text-xs text-emerald-700">📎 첨부됨: {receiptFile.name} <button type="button" className="ml-1 text-muted-foreground underline" onClick={() => setReceiptFile(null)}>제거</button></div>
          )}
          {ocrNote && <div className="text-xs text-amber-700">{ocrNote}</div>}

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
                  {sessions.map((s) => (
                    <SelectItem key={s.sessionNo} value={String(s.sessionNo)}>{s.sessionNo}회차 · {s.subject}</SelectItem>
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
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          {(category === "강사비" || category === "퍼실리테이터비용") && (
            <Button variant="secondary" onClick={() => submit(true)} disabled={isPending} title="저장 후 같은 회차에 다음 강사를 이어서 입력">
              {isPending ? "저장 중..." : "저장 후 계속 추가"}
            </Button>
          )}
          <Button onClick={() => submit(false)} disabled={isPending}>{isPending ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
