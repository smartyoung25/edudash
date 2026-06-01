"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next1.length < 8) {
      setMsg({ type: "err", text: "새 비밀번호는 8자 이상이어야 합니다" });
      return;
    }
    if (next1 !== next2) {
      setMsg({ type: "err", text: "새 비밀번호 확인이 일치하지 않습니다" });
      return;
    }
    if (current === next1) {
      setMsg({ type: "err", text: "현재 비밀번호와 다른 값을 사용하세요" });
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "err", text: data.error ?? "변경 실패" });
        return;
      }
      setMsg({ type: "ok", text: "비밀번호가 변경되었습니다." });
      setCurrent("");
      setNext1("");
      setNext2("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cur">현재 비밀번호</Label>
        <Input
          id="cur"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new1">새 비밀번호 (8자 이상)</Label>
        <Input
          id="new1"
          type="password"
          autoComplete="new-password"
          value={next1}
          onChange={(e) => setNext1(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new2">새 비밀번호 확인</Label>
        <Input
          id="new2"
          type="password"
          autoComplete="new-password"
          value={next2}
          onChange={(e) => setNext2(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {msg && (
        <p role="alert" className={msg.type === "ok" ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
          {msg.text}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "변경 중..." : "변경하기"}
      </Button>
    </form>
  );
}
