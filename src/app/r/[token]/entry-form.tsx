"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2 } from "lucide-react";

export function QrEntryForm({
  teamId, teamName, headCount, defaultDate, defaultSessionNo,
}: {
  teamId: number; teamName: string; headCount: number; defaultDate: string; defaultSessionNo: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reportDate, setReportDate] = useState(defaultDate);
  const [sessionNo, setSessionNo] = useState(String(defaultSessionNo));
  const [subject, setSubject] = useState("");
  const [attended, setAttended] = useState(String(headCount));
  const [absent, setAbsent] = useState("0");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId, reportDate,
          sessionNo: Number(sessionNo),
          subject,
          attended: Number(attended),
          absent: Number(absent),
          notes: notes || null,
          source: "manual",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "저장 실패"); return; }
      setDone(true);
      setTimeout(() => router.refresh(), 800);
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border bg-emerald-50 text-emerald-800 p-6 flex flex-col items-center gap-2">
        <Check className="h-10 w-10" />
        <div className="text-base font-medium">저장됨</div>
        <div className="text-xs text-emerald-700">{teamName} {sessionNo}차시 · {reportDate}</div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => { setDone(false); }}>
          한 번 더 입력
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 bg-card border rounded-lg p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">교육일자</Label>
          <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required className="text-base h-11" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">차시</Label>
          <Input type="number" min={1} value={sessionNo} onChange={(e) => setSessionNo(e.target.value)} required className="text-base h-11" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">수업 주제</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="예: 스마트센서 설치 실습" className="text-base h-11" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">출석</Label>
          <Input type="number" min={0} inputMode="numeric" value={attended} onChange={(e) => setAttended(e.target.value)} required className="text-base h-11" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">불참</Label>
          <Input type="number" min={0} inputMode="numeric" value={absent} onChange={(e) => setAbsent(e.target.value)} required className="text-base h-11" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">비고</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full h-12 text-base gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        저장
      </Button>
    </form>
  );
}
