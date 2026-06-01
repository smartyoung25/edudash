"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteInfo {
  email: string;
  name: string;
  role: string;
  teamName: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  coordinator: "코디네이터",
  professor: "주임교수",
};

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTx] = useTransition();

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`/api/invite/${token}`);
        const data = await res.json();
        if (aborted) return;
        if (!res.ok) {
          setLoadErr(data.error ?? "초대 정보를 불러오지 못했습니다");
          return;
        }
        setInfo(data);
      } catch {
        if (!aborted) setLoadErr("네트워크 오류");
      }
    })();
    return () => {
      aborted = true;
    };
  }, [token]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw1.length < 8) {
      setErr("비밀번호는 8자 이상이어야 합니다");
      return;
    }
    if (pw1 !== pw2) {
      setErr("비밀번호 확인이 일치하지 않습니다");
      return;
    }
    startTx(async () => {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "가입 실패");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  if (loadErr) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-destructive">{loadErr}</p>
        <p className="text-xs text-muted-foreground">관리자에게 새 초대 링크를 요청해주세요.</p>
      </div>
    );
  }

  if (!info) {
    return <p className="text-center text-sm text-muted-foreground">초대 정보 불러오는 중...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">이메일</span> <span className="font-mono">{info.email}</span>
        </div>
        <div>
          <span className="text-muted-foreground">이름</span> <span className="font-medium">{info.name}</span>
        </div>
        <div>
          <span className="text-muted-foreground">역할</span>{" "}
          <span className="font-medium">{ROLE_LABEL[info.role] ?? info.role}</span>
          {info.teamName && <span className="text-muted-foreground"> · 담당 팀: {info.teamName}</span>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pw1">비밀번호 (8자 이상)</Label>
        <Input
          id="pw1"
          type="password"
          autoComplete="new-password"
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw2">비밀번호 확인</Label>
        <Input
          id="pw2"
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "가입 중..." : "가입하고 로그인"}
      </Button>
    </form>
  );
}
