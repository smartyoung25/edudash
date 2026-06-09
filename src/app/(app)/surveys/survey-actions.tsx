"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2, Check, Trash2 } from "lucide-react";

export function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={copy} title="공개 응답 링크 복사">
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
      {copied ? "복사됨" : "링크"}
    </Button>
  );
}

export function DeleteSurveyButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function onClick() {
    if (!confirm("이 설문과 모든 응답을 삭제합니다. 계속할까요?")) return;
    start(async () => {
      const r = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(typeof d.error === "string" ? d.error : "삭제 실패"); return; }
      router.refresh();
    });
  }
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onClick} disabled={pending} title="삭제">
      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
    </Button>
  );
}
