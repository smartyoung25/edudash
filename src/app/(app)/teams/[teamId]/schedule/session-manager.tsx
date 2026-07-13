"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Pencil, Check, X, Plus, Settings2 } from "lucide-react";

export interface SessionRow {
  id: number;
  sessionNo: number;
  subject: string;
  scheduledDate: string;
  status: "planned" | "in-progress" | "done";
}

const STATUS_LABEL: Record<SessionRow["status"], string> = {
  planned: "예정",
  "in-progress": "진행중",
  done: "완료",
};

export function SessionManager({ teamId, sessions }: { teamId: number; sessions: SessionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNo, setEditNo] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<SessionRow["status"]>("planned");
  const [editErr, setEditErr] = useState<string | null>(null);

  const nextNo = (sessions.reduce((m, s) => Math.max(m, s.sessionNo), 0) || 0) + 1;
  const [newNo, setNewNo] = useState(String(nextNo));
  const [newSubject, setNewSubject] = useState("");
  const [newDate, setNewDate] = useState("");
  const [adding, setAdding] = useState(false);

  function startEdit(s: SessionRow) {
    setEditErr(null);
    setEditingId(s.id);
    setEditNo(String(s.sessionNo));
    setEditSubject(s.subject);
    setEditDate(s.scheduledDate);
    setEditStatus(s.status);
  }

  function saveEdit() {
    if (editingId == null) return;
    setEditErr(null);
    if (!editSubject.trim()) { setEditErr("주제를 입력하세요"); return; }
    if (!editDate) { setEditErr("예정일을 입력하세요"); return; }
    const id = editingId;
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/sessions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, sessionNo: Number(editNo), subject: editSubject, scheduledDate: editDate, status: editStatus }),
      });
      if (res.ok) { setEditingId(null); router.refresh(); }
      else { const j = await res.json().catch(() => ({})); setEditErr(j.error || "수정 실패"); }
    });
  }

  function remove(id: number, label: string) {
    if (!confirm(`${label}를 삭제할까요? 연결된 지출 내역의 회차 지정도 함께 해제됩니다.`)) return;
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/sessions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
      else { const j = await res.json().catch(() => ({})); setErr(j.error || "삭제 실패"); }
    });
  }

  function addSession() {
    setErr(null);
    if (!newSubject.trim()) { setErr("주제를 입력하세요"); return; }
    if (!newDate) { setErr("예정일을 입력하세요"); return; }
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionNo: Number(newNo) || undefined, subject: newSubject, scheduledDate: newDate }),
      });
      if (res.ok) {
        setNewSubject(""); setNewDate(""); setAdding(false);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "추가 실패");
      }
    });
  }

  return (
    <Card className="p-6 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">회차 관리 (관리자)</h3>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-3 py-2 text-left w-20">회차</th>
              <th className="px-3 py-2 text-left">주제</th>
              <th className="px-3 py-2 text-left w-36">예정일</th>
              <th className="px-3 py-2 text-left w-28">상태</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">등록된 회차가 없습니다.</td></tr>
            )}
            {sessions.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="border-t bg-muted/20">
                  <td className="px-2 py-1.5">
                    <Input type="number" min={1} value={editNo} onChange={(e) => setEditNo(e.target.value)} className="h-8 w-16" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="h-8" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={editStatus} onValueChange={(v) => setEditStatus(v as SessionRow["status"])}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABEL) as SessionRow["status"][]).map((k) => (
                          <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={saveEdit} disabled={pending} className="text-emerald-700 hover:text-emerald-900" title="저장">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={() => setEditingId(null)} disabled={pending} className="text-muted-foreground hover:text-foreground" title="취소">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {editErr && <div className="text-xs text-rose-600 mt-1">{editErr}</div>}
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className="border-t hover:bg-muted/10 group">
                  <td className="px-3 py-2 tabular-nums font-medium">{s.sessionNo}</td>
                  <td className="px-3 py-2">{s.subject}</td>
                  <td className="px-3 py-2 tabular-nums">{s.scheduledDate}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[s.status]}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                      <button onClick={() => startEdit(s)} disabled={pending} className="text-muted-foreground hover:text-foreground" title="수정">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(s.id, `${s.sessionNo}회차`)} disabled={pending} className="text-muted-foreground hover:text-rose-600" title="삭제">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {err && <div className="text-sm text-rose-600 mt-2">{err}</div>}

      <div className="mt-3">
        {adding ? (
          <div className="flex items-end gap-2 flex-wrap rounded-md border p-3">
            <div>
              <label className="text-xs text-muted-foreground">회차</label>
              <Input type="number" min={1} value={newNo} onChange={(e) => setNewNo(e.target.value)} className="h-8 w-16" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">주제</label>
              <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="예: 병해충 관리" className="h-8" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">예정일</label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8" />
            </div>
            <Button size="sm" onClick={addSession} disabled={pending} className="h-8 gap-1">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              추가
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setErr(null); }} className="h-8">취소</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            회차 추가
          </Button>
        )}
      </div>
    </Card>
  );
}
