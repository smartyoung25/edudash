"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle } from "lucide-react";
import type { Team } from "@/db/schema";

export function ManualEntryButton({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<string>("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionNo, setSessionNo] = useState<string>("1");
  const [subject, setSubject] = useState("");
  const [attended, setAttended] = useState<string>("0");
  const [absent, setAbsent] = useState<string>("0");
  const [absentNames, setAbsentNames] = useState("");
  const [absentReason, setAbsentReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTeamId(""); setSessionNo("1"); setSubject("");
    setAttended("0"); setAbsent("0"); setAbsentNames(""); setAbsentReason(""); setNotes("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) { setError("팀을 선택해주세요"); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: Number(teamId),
          reportDate,
          sessionNo: Number(sessionNo),
          subject,
          attended: Number(attended),
          absent: Number(absent),
          absentNames: absentNames || null,
          absentReason: absentReason || null,
          notes: notes || null,
          source: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "저장 실패"); return; }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4" />
          수동 입력
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>일일 수업 현황 입력</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>팀</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.cohort})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>교육일자</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>차시</Label>
              <Input type="number" min="1" value={sessionNo} onChange={(e) => setSessionNo(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>수업 주제</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="예: 스마트센서 설치 실습" />
            </div>
            <div className="space-y-1.5">
              <Label>출석 인원</Label>
              <Input type="number" min="0" value={attended} onChange={(e) => setAttended(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>불참 인원</Label>
              <Input type="number" min="0" value={absent} onChange={(e) => setAbsent(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>불참자명 (쉼표 구분)</Label>
            <Input value={absentNames} onChange={(e) => setAbsentNames(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>불참 사유</Label>
            <Input value={absentReason} onChange={(e) => setAbsentReason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>비고</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "저장 중..." : "저장"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
