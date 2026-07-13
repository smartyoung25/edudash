"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, FileText, Save, Loader2, ImageOff, Sparkles, AlertTriangle, Upload } from "lucide-react";
import { classifyExpense } from "@/lib/integrations/expense-classifier";

export type ReceiptStatus = "ok" | "missing" | "none";

export interface SessionOption {
  sessionNo: number;
  subject: string;
}

const CATEGORIES = ["강사비", "퍼실리테이터비용", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] as const;
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
  status = "ok",
  sessions = [],
  sessionNo = null,
  teamId,
  teams = [],
}: {
  expenseId: number;
  mimeType?: string | null;
  triggerLabel?: string;
  initial?: ReceiptViewerInitial;
  editable?: boolean;
  status?: ReceiptStatus;
  sessions?: SessionOption[];
  sessionNo?: number | null;
  teamId?: number;
  teams?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const isPdf = mimeType === "application/pdf";
  const hasReceipt = status === "ok";

  async function uploadReceipt(file: File) {
    setUploadMsg(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      const res = await fetch(`/api/expenses/${expenseId}/receipt`, { method: "POST", body: fd });
      if (res.ok) {
        setUploadMsg("업로드됨");
        router.refresh();
        setTimeout(() => setOpen(false), 600);
      } else {
        const j = await res.json().catch(() => ({}));
        setUploadMsg(j.error || "업로드 실패");
      }
    } catch {
      setUploadMsg("업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  const [form, setForm] = useState(() => ({
    spentDate: initial?.spentDate ?? "",
    teamId: teamId != null ? String(teamId) : "",
    sessionNo: sessionNo == null ? "none" : String(sessionNo),
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

  // vendorName + memo만으로 룰 기반 카테고리 추천 (OCR 재실행 없음)
  const suggestion = (() => {
    const vendor = form.vendorName?.trim();
    const memo = form.memo?.trim();
    if (!vendor && !memo) return null;
    const r = classifyExpense({ text: memo || "", vendorName: vendor || null });
    if (r.confidence < 0.5) return null;
    if (r.category === form.category) return null; // 이미 같으면 표시 안 함
    return r;
  })();

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
        body: JSON.stringify({
          id: expenseId,
          ...form,
          sessionNo: form.sessionNo === "none" ? null : Number(form.sessionNo),
        }),
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

  const trigger =
    status === "ok"
      ? { Icon: ImageIcon, label: triggerLabel ?? "영수증", cls: "text-emerald-700 hover:text-emerald-900" }
      : status === "missing"
        ? { Icon: AlertTriangle, label: triggerLabel ?? "영수증 누락", cls: "text-amber-700 hover:text-amber-900" }
        : { Icon: Upload, label: triggerLabel ?? "영수증 추가", cls: "text-slate-600 hover:text-slate-900" };
  const Icon = trigger.Icon;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline ${trigger.cls}`}
        title="영수증 보기 / 업로드 / 금액 수정"
      >
        <Icon className="h-3.5 w-3.5" />
        {trigger.label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> 영수증 보기 / 금액 수정
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 좌: 영수증 이미지 또는 플레이스홀더 + 업로드 */}
            <div className="max-h-[70vh] min-h-[300px] overflow-auto bg-muted/20 rounded-md flex flex-col items-center justify-center gap-3 p-3">
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
                <div className="flex flex-col items-center gap-3 text-sm py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {status === "missing" ? <AlertTriangle className="h-10 w-10 text-amber-500" /> : <ImageOff className="h-10 w-10 opacity-50" />}
                    <div>{status === "missing" ? "영수증 누락 — 원본 파일을 찾을 수 없습니다" : "영수증 미첨부"}</div>
                  </div>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-muted/50">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    영수증 업로드
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.bmp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); }}
                    />
                  </label>
                  {uploadMsg && <span className={`text-xs ${uploadMsg === "업로드됨" ? "text-emerald-700" : "text-rose-600"}`}>{uploadMsg}</span>}
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
                    {suggestion && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: suggestion.category }))}
                        title={suggestion.reasons.join(" · ")}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900 hover:underline underline-offset-2"
                      >
                        <Sparkles className="h-3 w-3" />
                        추천: {suggestion.category} ({Math.round(suggestion.confidence * 100)}%) — 클릭 적용
                      </button>
                    )}
                  </div>
                </div>

                {teams.length > 0 && (
                  <div>
                    <Label className="text-xs">팀 (이동 · 관리자)</Label>
                    <Select value={form.teamId} onValueChange={(v) => setForm((f) => ({ ...f, teamId: v }))}>
                      <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="text-[10px] text-muted-foreground mt-0.5">다른 팀으로 잘못 들어온 영수증을 옮길 때만 변경</div>
                  </div>
                )}

                <div>
                  <Label className="text-xs">회차 (이동)</Label>
                  <Select value={form.sessionNo} onValueChange={(v) => setForm((f) => ({ ...f, sessionNo: v }))}>
                    <SelectTrigger><SelectValue placeholder="회차 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미지정</SelectItem>
                      {sessions.map((s) => (
                        <SelectItem key={s.sessionNo} value={String(s.sessionNo)}>{s.sessionNo}회차 · {s.subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
