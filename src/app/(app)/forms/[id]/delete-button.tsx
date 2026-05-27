"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function onClick() {
    if (!confirm("정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    start(async () => {
      const r = await fetch(`/api/forms/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error ?? "삭제 실패");
        return;
      }
      router.push("/forms");
      router.refresh();
    });
  }
  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={pending}>
      <Trash2 className="h-4 w-4" /> {pending ? "삭제 중..." : "삭제"}
    </Button>
  );
}
