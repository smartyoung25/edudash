"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

export function MailSyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/integrations/mail/sync", { method: "POST" });
      const data = await res.json();
      setMsg(data.message ?? (data.ok ? "수집 완료" : "수집 실패"));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button onClick={sync} disabled={isPending} variant="outline" size="sm">
        <Mail className="h-4 w-4" />
        {isPending ? "수집 중..." : "메일 수집"}
      </Button>
    </div>
  );
}
