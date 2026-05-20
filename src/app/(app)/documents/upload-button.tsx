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
  const [progress, setProgress] = useState<number>(0);
  const [isPending, startTransition] = useTransition();

  async function uploadToDrive(uploadUrl: string, f: File): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", f.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.id) resolve({ id: data.id });
            else reject(new Error("Drive 응답에 fileId 누락"));
          } catch {
            reject(new Error("Drive 응답 파싱 실패"));
          }
        } else {
          reject(new Error(`Drive 업로드 실패: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Drive 업로드 네트워크 오류"));
      xhr.send(f);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !docType || !month || !file) {
      setError("모든 항목을 입력해주세요");
      return;
    }
    setError(null);
    setProgress(0);
    startTransition(async () => {
      try {
        // 1) 서버에서 Drive resumable session URL 발급
        const r1 = await fetch("/api/documents/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: Number(teamId),
            docType,
            month: Number(month),
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || undefined,
          }),
        });
        const d1 = await r1.json();
        if (!r1.ok) {
          setError(typeof d1.error === "string" ? d1.error : "업로드 URL 발급 실패");
          return;
        }

        // 2) 브라우저 → Drive 직접 업로드
        const { id } = await uploadToDrive(d1.uploadUrl, file);

        // 3) 메타데이터 등록
        const r3 = await fetch("/api/documents/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: Number(teamId),
            docType,
            month: Number(month),
            fileId: id,
            fileName: file.name,
          }),
        });
        const d3 = await r3.json();
        if (!r3.ok) {
          setError(typeof d3.error === "string" ? d3.error : "메타데이터 저장 실패");
          return;
        }

        setTeamId("");
        setDocType("");
        setMonth("");
        setFile(null);
        setProgress(0);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "업로드 실패");
      }
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
          {isPending && progress > 0 && (
            <div className="text-xs text-muted-foreground">업로드 중... {progress}%</div>
          )}
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
