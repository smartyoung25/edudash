"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Circle, Loader2, Users, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

export type SessionStatus = "planned" | "in-progress" | "done";

export interface ScheduleRow {
  id: number;
  sessionNo: number;
  subject: string;
  scheduledDate: string;
  status: SessionStatus;
  displayNo: number | null; // null이면 취소
  state: "done" | "today" | "past" | "planned";
  rep?: {
    reportDate: string;
    attended: number;
    absent: number;
    absentNames: string | null;
    absentReason: string | null;
    source: string;
  };
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: "예정",
  "in-progress": "진행중",
  done: "완료",
};

export function ScheduleTimeline({ teamId, rows, canEdit }: { teamId: number; rows: ScheduleRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNo, setEditNo] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<SessionStatus>("planned");
  const [editErr, setEditErr] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const nextNo = (rows.reduce((m, r) => Math.max(m, r.sessionNo), 0) || 0) + 1;
  const [newNo, setNewNo] = useState(String(nextNo));
  const [newSubject, setNewSubject] = useState("");
  const [newDate, setNewDate] = useState("");

  function startEdit(r: ScheduleRow) {
    setErr(null);
    setEditErr(null);
    setEditingId(r.id);
    setEditNo(String(r.sessionNo));
    setEditSubject(r.subject);
    setEditDate(r.scheduledDate);
    setEditStatus(r.status);
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
    <>
      {rows.length > 0 && (
        <ol className="relative border-l-2 border-muted ml-4 space-y-6">
          {rows.map((r) => {
            const { rep, state, displayNo } = r;
            const isEditing = editingId === r.id;
            return (
              <li key={r.id} className="ml-6 group">
                <span
                  className={cn(
                    "absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-background",
                    state === "done" && "bg-emerald-500 text-white",
                    state === "today" && "bg-amber-500 text-white animate-pulse",
                    state === "past" && "bg-rose-500/80 text-white",
                    state === "planned" && "bg-background border-2 border-muted-foreground/30",
                  )}
                >
                  {state === "done" && <CheckCircle2 className="h-4 w-4" />}
                  {state === "today" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {state !== "done" && state !== "today" && <Circle className="h-2 w-2 text-transparent" />}
                </span>

                {isEditing ? (
                  <div className="rounded-md border p-3 bg-muted/20 space-y-2">
                    <div className="flex items-end gap-2 flex-wrap">
                      <div>
                        <label className="text-xs text-muted-foreground">회차</label>
                        <Input type="number" min={1} value={editNo} onChange={(e) => setEditNo(e.target.value)} className="h-8 w-16" />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-xs text-muted-foreground">주제</label>
                        <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="h-8" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">예정일</label>
                        <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">상태</label>
                        <Select value={editStatus} onValueChange={(v) => setEditStatus(v as SessionStatus)}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABEL) as SessionStatus[]).map((k) => (
                              <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1.5 pb-1.5">
                        <button onClick={saveEdit} disabled={pending} className="text-emerald-700 hover:text-emerald-900" title="저장">
                          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setEditingId(null)} disabled={pending} className="text-muted-foreground hover:text-foreground" title="취소">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {editErr && <div className="text-xs text-rose-600">{editErr}</div>}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 flex-wrap">
                      {displayNo !== null ? (
                        <Badge variant="outline" className="font-mono">{displayNo}차시</Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono opacity-60 line-through">PDF {r.sessionNo}차시</Badge>
                      )}
                      <span className={cn("font-medium", state === "past" && "text-muted-foreground line-through")}>{r.subject}</span>
                      {state === "done" && <Badge variant="success">완료</Badge>}
                      {state === "today" && <Badge variant="warning">오늘 예정</Badge>}
                      {state === "past" && <Badge variant="destructive">취소(미진행)</Badge>}
                      {state === "planned" && <Badge variant="muted">예정</Badge>}
                      {canEdit && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 ml-auto">
                          <button onClick={() => startEdit(r)} disabled={pending} className="text-muted-foreground hover:text-foreground" title="수정">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(r.id, `${r.sessionNo}회차`)} disabled={pending} className="text-muted-foreground hover:text-rose-600" title="삭제">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                      {rep ? (
                        rep.reportDate !== r.scheduledDate ? (
                          <>
                            <span className="font-medium text-foreground">{formatDate(rep.reportDate)}</span>
                            <span className="text-xs line-through opacity-60">예정 {formatDate(r.scheduledDate)}</span>
                            <Badge variant="info" className="text-[10px] py-0">일정 변경</Badge>
                          </>
                        ) : (
                          <span>{formatDate(rep.reportDate)}</span>
                        )
                      ) : (
                        <span>{formatDate(r.scheduledDate)}</span>
                      )}
                    </div>

                    {rep && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-1.5">
                        <Users className="h-3 w-3" />
                        <span>출석 {rep.attended}명 / 불참 {rep.absent}명</span>
                        {rep.absentNames && <span>· 불참자: {rep.absentNames}</span>}
                        {rep.absentReason && <span>· {rep.absentReason}</span>}
                        <span className="ml-auto">{rep.source === "sheet" ? "시트 자동" : "수동"}</span>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {canEdit && (
        <div className={cn(rows.length > 0 && "mt-6 ml-4 pl-6 border-l-2 border-transparent")}>
          {err && <div className="text-sm text-rose-600 mb-2">{err}</div>}
          {adding ? (
            <div className="flex items-end gap-2 flex-wrap rounded-md border p-3 bg-muted/20">
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
      )}
    </>
  );
}
