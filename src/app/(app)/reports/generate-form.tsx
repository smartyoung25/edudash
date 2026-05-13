"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";

export function GenerateForm({ defaultWeekStart }: { defaultWeekStart: string }) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/reports/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "생성 실패");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `weekly_${weekStart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      router.refresh();
    });
  }

  return (
    <form onSubmit={generate} className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1.5">
        <Label htmlFor="weekStart">주차 시작일 (월요일 권장)</Label>
        <Input id="weekStart" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-48" />
      </div>
      <Button type="submit" disabled={isPending}>
        <Download className="h-4 w-4" />
        {isPending ? "생성 중..." : "엑셀 생성 및 다운로드"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
