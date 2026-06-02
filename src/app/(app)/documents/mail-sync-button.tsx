"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail } from "lucide-react";

const PERIODS = [
  { v: "unread", label: "미읽음만" },
  { v: "7", label: "최근 7일" },
  { v: "30", label: "최근 30일" },
  { v: "90", label: "최근 90일" },
];

export function MailSyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [period, setPeriod] = useState("7");

  function sync() {
    setMsg(null);
    startTransition(async () => {
      // 기간 선택 시 읽은 메일까지 다시 훑어 누락분을 찾음(중복은 자동 제외)
      const qs = period === "unread" ? "" : `?sinceDays=${period}&includeRead=1`;
      const res = await fetch(`/api/integrations/mail/sync${qs}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(data.message ?? (data.ok ? "수집 완료" : "수집 실패"));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground max-w-[340px] truncate" title={msg}>{msg}</span>}
      <Select value={period} onValueChange={setPeriod} disabled={isPending}>
        <SelectTrigger className="h-9 w-[112px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button onClick={sync} disabled={isPending} variant="outline" size="sm">
        <Mail className="h-4 w-4" />
        {isPending ? "수집 중..." : "메일 수집"}
      </Button>
    </div>
  );
}
