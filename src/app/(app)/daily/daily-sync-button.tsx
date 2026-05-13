"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function DailySyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/integrations/sheets/sync", { method: "POST" });
      const data = await res.json();
      setMsg(data.message ?? (data.ok ? "동기화 완료" : "동기화 실패"));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button onClick={sync} disabled={isPending} variant="outline" size="sm">
        <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {isPending ? "동기화 중..." : "지금 동기화"}
      </Button>
    </div>
  );
}
