"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TeamNote {
  id: number;
  noteDate: string;
  content: string;
  createdByName: string | null;
}

export function TeamNotes({
  teamId,
  notes,
  canEdit,
}: {
  teamId: number;
  notes: TeamNote[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editErr, setEditErr] = useState<string | null>(null);

  function startEdit(n: TeamNote) {
    setEditErr(null);
    setEditingId(n.id);
    setEditDate(n.noteDate);
    setEditContent(n.content);
  }

  function saveEdit() {
    if (editingId == null) return;
    setEditErr(null);
    if (!editContent.trim()) { setEditErr("내용을 입력하세요"); return; }
    const id = editingId;
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, noteDate: editDate, content: editContent }),
      });
      if (res.ok) { setEditingId(null); router.refresh(); }
      else { const j = await res.json().catch(() => ({})); setEditErr(j.error || "수정 실패"); }
    });
  }

  function add() {
    setErr(null);
    if (!content.trim()) { setErr("내용을 입력하세요"); return; }
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteDate: date, content }),
      });
      if (res.ok) { setContent(""); router.refresh(); }
      else { const j = await res.json().catch(() => ({})); setErr(j.error || "추가 실패"); }
    });
  }

  function remove(id: number) {
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" />
        특이사항
      </div>

      <div className="space-y-1.5 max-h-44 overflow-auto pr-0.5">
        {notes.length === 0 ? (
          <div className="text-xs text-muted-foreground/70 py-1">등록된 특이사항이 없습니다.</div>
        ) : (
          notes.map((n) =>
            canEdit && editingId === n.id ? (
              <div key={n.id} className="space-y-1.5 rounded-md border bg-background p-2">
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-7 w-[8.5rem] text-xs" />
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                    className="h-7 flex-1 text-sm"
                    autoFocus
                  />
                  <button onClick={saveEdit} disabled={pending} className="text-emerald-700 hover:text-emerald-900 shrink-0" title="저장">
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button onClick={() => setEditingId(null)} disabled={pending} className="text-muted-foreground hover:text-foreground shrink-0" title="취소">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {editErr && <div className="text-xs text-rose-600">{editErr}</div>}
              </div>
            ) : (
              <div key={n.id} className="group flex items-start gap-1.5 text-sm">
                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground mt-0.5">{n.noteDate}</span>
                <span className="flex-1 whitespace-pre-wrap break-words leading-snug" title={n.createdByName ? `작성: ${n.createdByName}` : undefined}>
                  {n.content}
                </span>
                {canEdit && (
                  <span className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      onClick={() => startEdit(n)}
                      disabled={pending}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                      title="수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(n.id)}
                      disabled={pending}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-600"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )
          )
        )}
      </div>

      {canEdit && (
        <div className="space-y-1.5 pt-2 border-t">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-[8.5rem] text-xs"
            />
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="특이사항 입력 후 추가"
              className="h-8 flex-1 text-sm"
            />
            <Button onClick={add} disabled={pending} size="sm" className="h-8 gap-1 px-2.5">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              추가
            </Button>
          </div>
          {err && <div className="text-xs text-rose-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
