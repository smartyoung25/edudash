"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";

// 이미 수집된 경비영수증을 OCR 재처리하여 팀별/기관 정산에 반영
export function BackfillButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/expenses/backfill-from-documents", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(data.message ?? (data.ok ? "완료" : "실패"));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground max-w-[340px] truncate" title={msg}>{msg}</span>}
      <Button onClick={run} disabled={isPending} variant="outline" size="sm">
        <Receipt className="h-4 w-4" />
        {isPending ? "정산 반영 중..." : "영수증 정산 반영"}
      </Button>
    </div>
  );
}
