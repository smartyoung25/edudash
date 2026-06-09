"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function CleanupSelfButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    if (!confirm("미분류 중 stepup2 자기발신·나간 메일(딸기11기 장성 제외) 첨부를 삭제합니다. 계속할까요?")) return;
    setMsg(null);
    start(async () => {
      const res = await fetch("/api/documents/cleanup-self", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(typeof d.error === "string" ? d.error : "정리 실패"); return; }
      setMsg(d.deleted > 0 ? `${d.deleted}건 삭제됨` : "삭제할 항목 없음");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button type="button" size="sm" variant="outline" onClick={run} disabled={pending}>
        <Trash2 className="h-4 w-4" /> {pending ? "정리 중..." : "stepup2 오수집 정리"}
      </Button>
    </div>
  );
}
