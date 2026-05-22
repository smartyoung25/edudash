"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

export function TeamReimburseButton({
  id,
  status,
  note,
  label,
}: {
  id: number;
  status: string | null;
  note: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [inputNote, setInputNote] = useState(note ?? "");

  const isDone = status === "정산완료";

  function submit() {
    startTransition(async () => {
      await fetch(`/api/expenses/${id}/reimburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "정산완료", note: inputNote || null }),
      });
      setOpen(false);
      router.refresh();
    });
  }
  function revert() {
    if (!confirm("정산완료를 취소하고 미정산으로 되돌릴까요?")) return;
    startTransition(async () => {
      await fetch(`/api/expenses/${id}/reimburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "미정산", note: null }),
      });
      router.refresh();
    });
  }

  if (isDone) {
    return (
      <button
        onClick={revert}
        disabled={isPending}
        title={note ?? "정산완료 — 클릭해서 되돌리기"}
        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
      >
        <Check className="h-3 w-3" />
        지급완료
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-orange-300 bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
      >
        + {label ?? "지급처리"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{label ?? "지급"} 처리</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">처리 메모 (선택)</Label>
              <Input
                value={inputNote}
                onChange={(e) => setInputNote(e.target.value)}
                placeholder="예: 5/22 김종우 주임 통장 입금"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              완료 처리 시 처리 일시가 자동 기록됩니다.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={submit} disabled={isPending}>{isPending ? "처리 중..." : "완료 처리"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
