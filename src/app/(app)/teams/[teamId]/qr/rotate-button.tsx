"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

export function RotateButton({ teamId }: { teamId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  async function rotate() {
    const res = await fetch(`/api/teams/${teamId}/qr`, { method: "POST" });
    if (res.ok) start(() => router.refresh());
    setConfirming(false);
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)} className="gap-1">
        <RefreshCw className="h-3.5 w-3.5" /> 토큰 새로 발급
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">기존 QR이 즉시 만료됩니다. 진행할까요?</span>
      <Button size="sm" variant="destructive" onClick={rotate} disabled={pending} className="gap-1">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} 발급
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>취소</Button>
    </div>
  );
}
