"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2, Check, Trash2 } from "lucide-react";

export function CopyLinkButton({ token, status }: { token: string; status: "draft" | "open" | "closed" }) {
  const [copied, setCopied] = useState(false);
  const isOpen = status === "open";
  function copy() {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      if (!isOpen) {
        // 비공개(작성중/마감) 설문은 링크를 열어도 응답을 받지 못함 — 복사 시 안내.
        alert(
          status === "draft"
            ? "링크는 복사됐지만 이 설문은 '작성중'이라 응답을 받을 수 없습니다.\n편집에서 상태를 '진행중(응답 가능)'으로 바꾼 뒤 저장하세요."
            : "링크는 복사됐지만 이 설문은 '마감'되어 더 이상 응답을 받지 않습니다.",
        );
      }
    });
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={copy}
        title={isOpen ? "공개 응답 링크 복사" : "현재 비공개 — '진행중'으로 바꿔야 응답을 받을 수 있습니다"}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
        {copied ? "복사됨" : "링크"}
      </Button>
      {!isOpen && (
        <span className="text-[11px] font-medium text-amber-600 whitespace-nowrap" title="진행중으로 바꿔야 응답 가능">
          비공개
        </span>
      )}
    </span>
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
