"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

export function UploadCsvButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File) {
    setMsg("업로드 중...");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/card-statements/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(`실패: ${j.error || res.statusText}`);
      return;
    }
    const r = j.result;
    setMsg(`완료: ${r.inserted}건 추가, ${r.matched}건 자동매칭, ${r.skippedDuplicate}건 중복, ${r.unmatched}건 미매칭`);
    start(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={pending} size="sm" className="gap-1">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        카드 명세서 CSV 업로드
      </Button>
    </div>
  );
}
