"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteAgencyButton({ id }: { id: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function del() {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(async () => {
      await fetch("/api/agency-expenses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      router.refresh();
    });
  }
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={del} disabled={isPending}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
