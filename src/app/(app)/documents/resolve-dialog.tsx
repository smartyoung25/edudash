"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Team, Document } from "@/db/schema";

const DOC_TYPES = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"];

export function ResolveDialog({ teams, unclassified }: { teams: Team[]; unclassified: Document[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(String(unclassified[0]?.id ?? ""));
  const [teamId, setTeamId] = useState("");
  const [docType, setDocType] = useState("");
  const [isPending, startTransition] = useTransition();

  const currentDoc = unclassified.find((d) => d.id === Number(selectedId));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !docType) return;
    startTransition(async () => {
      await fetch("/api/documents/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(selectedId), teamId: Number(teamId), docType }),
      });
      setTeamId(""); setDocType("");
      router.refresh();
      if (unclassified.length === 1) setOpen(false);
    });
  }

  function remove() {
    if (!selectedId) return;
    const name = currentDoc?.fileName ?? "이 서류";
    if (!confirm(`"${name}"를 삭제할까요?\n사업과 무관한 서류라면 삭제하세요. Drive 파일도 휴지통으로 이동됩니다.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/documents/${Number(selectedId)}`, { method: "DELETE" });
      if (res.ok) {
        // 다음 미분류 서류로 선택 이동
        const rest = unclassified.filter((d) => d.id !== Number(selectedId));
        setSelectedId(String(rest[0]?.id ?? ""));
        setTeamId(""); setDocType("");
        router.refresh();
        if (rest.length === 0) setOpen(false);
      } else {
        alert("삭제 실패: 권한 또는 서버 오류");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">미분류 처리</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>미분류 서류 분류</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>대상 서류</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {unclassified.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.fileName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentDoc && (
              <div className="text-xs text-muted-foreground">
                보낸이: {currentDoc.emailFrom ?? "—"} · 제목: {currentDoc.emailSubject ?? "—"}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>팀</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>서류 유형</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="destructive" disabled={isPending || !selectedId} onClick={remove}>
              삭제 (사업 무관)
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={isPending || !teamId || !docType}>분류</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
