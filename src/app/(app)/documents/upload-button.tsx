"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload } from "lucide-react";
import type { Team } from "@/db/schema";

const DOC_TYPES = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"];
const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export function UploadButton({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [docType, setDocType] = useState("");
  const [month, setMonth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !docType || !month || !file) {
      setError("모든 항목을 입력해주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("teamId", teamId);
      fd.append("docType", docType);
      fd.append("month", month);
      fd.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "업로드 실패"); return; }
      setTeamId(""); setDocType(""); setMonth(""); setFile(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="h-4 w-4" />
          수동 업로드
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>서류 수동 업로드</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>서류 유형</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>귀속 월</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue placeholder="월" /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => <SelectItem key={m} value={String(m)}>{m}월</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>파일</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.hwp,.docx,.xlsx,.jpg,.jpeg,.png" />
            <div className="text-xs text-muted-foreground">PDF, HWP, DOCX, XLSX, JPG, PNG · 최대 20MB</div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "업로드 중..." : "업로드"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
