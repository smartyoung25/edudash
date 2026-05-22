"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";

const CATEGORIES = ["주임강사수당", "퍼실리테이터수당", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] as const;

export function BudgetDialog({
  teamId,
  currentBudgets,
}: {
  teamId: number;
  currentBudgets: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [budgets, setBudgets] = useState<Record<string, string>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c, String(currentBudgets[c] ?? 0)]))
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      for (const c of CATEGORIES) {
        const amount = Number(budgets[c]) || 0;
        const res = await fetch("/api/expenses/budget", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, category: c, amount }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || `${c} 저장 실패`);
          return;
        }
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Settings2 className="h-4 w-4 mr-1" />예산 설정</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>카테고리별 예산 설정</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {CATEGORIES.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <Label className="w-16 text-sm">{c}</Label>
              <Input
                type="number"
                value={budgets[c]}
                onChange={(e) => setBudgets((b) => ({ ...b, [c]: e.target.value }))}
                placeholder="0"
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8">원</span>
            </div>
          ))}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={save} disabled={isPending}>{isPending ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
