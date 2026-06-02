"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail } from "lucide-react";

const PERIODS = [
  { v: "unread", label: "미읽음만" },
  { v: "7", label: "최근 7일" },
  { v: "30", label: "최근 30일" },
  { v: "90", label: "최근 90일" },
  { v: "120", label: "최근 120일" },
  { v: "180", label: "최근 180일" },
];

export function MailSyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [period, setPeriod] = useState("7");
  const [sender, setSender] = useState("");

  function sync() {
    setMsg(null);
    startTransition(async () => {
      const params = new URLSearchParams();
      const from = sender.trim().toLowerCase();
      // 기간 선택 또는 발신자 지정 시 읽은 메일까지 재스캔(중복 자동 제외)
      if (period !== "unread") {
        params.set("sinceDays", period);
        params.set("includeRead", "1");
      }
      if (from) {
        params.set("fromEmail", from);
        params.set("includeRead", "1");
        // 발신자 지정인데 기간이 미읽음만이면 기본 180일 적용
        if (period === "unread") params.set("sinceDays", "180");
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/integrations/mail/sync${qs}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(data.message ?? (data.ok ? "수집 완료" : "수집 실패"));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {msg && <span className="text-xs text-muted-foreground max-w-[340px] truncate" title={msg}>{msg}</span>}
      <Input
        value={sender}
        onChange={(e) => setSender(e.target.value)}
        placeholder="발신자(선택) 예: purelea@iiam.co.kr"
        className="h-9 w-[230px]"
        disabled={isPending}
      />
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
