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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [teamId, setTeamId] = useState("");
  const [docType, setDocType] = useState("");
  const [isPending, startTransition] = useTransition();

  const ids = [...selected];
  const allChecked = unclassified.length > 0 && selected.size === unclassified.length;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(unclassified.map((d) => d.id)));
  }

  function classify() {
    if (!ids.length || !teamId || !docType) return;
    startTransition(async () => {
      await fetch("/api/documents/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, teamId: Number(teamId), docType }),
      });
      setSelected(new Set()); setTeamId(""); setDocType("");
      router.refresh();
      if (ids.length >= unclassified.length) setOpen(false);
    });
  }

  function remove() {
    if (!ids.length) return;
    if (!confirm(`선택한 ${ids.length}건을 삭제할까요?\n사업과 무관한 서류만 삭제하세요. Drive 파일도 휴지통으로 이동됩니다.`)) return;
    startTransition(async () => {
      const res = await fetch("/api/documents/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const removed = ids.length;
        setSelected(new Set());
        router.refresh();
        if (removed >= unclassified.length) setOpen(false);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>미분류 서류 일괄 처리</DialogTitle></DialogHeader>

        <div className="space-y-3">
          {/* 선택 목록 */}
          <div className="flex items-center justify-between">
            <Label>대상 서류 (여러 개 선택 가능)</Label>
            <button type="button" onClick={toggleAll} className="text-xs text-muted-foreground hover:text-foreground underline">
              {allChecked ? "전체 해제" : "전체 선택"}
            </button>
          </div>
          <div className="max-h-64 overflow-auto rounded-md border divide-y">
            {unclassified.map((d) => (
              <label key={d.id} className="flex items-start gap-2 p-2.5 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{d.fileName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    보낸이: {d.emailFrom ?? "—"} · 제목: {d.emailSubject ?? "—"}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* 분류 입력 */}
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
            <Button type="button" variant="destructive" disabled={isPending || !ids.length} onClick={remove}>
              선택 삭제{ids.length ? ` (${ids.length})` : ""}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>닫기</Button>
              <Button type="button" disabled={isPending || !ids.length || !teamId || !docType} onClick={classify}>
                선택 분류{ids.length ? ` (${ids.length})` : ""}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
