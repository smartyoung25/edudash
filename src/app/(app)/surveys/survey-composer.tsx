"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, ArrowUp, ArrowDown, Download, Upload } from "lucide-react";
import { QTYPE_LABEL, type QType } from "@/lib/survey";

type QRow = {
  section: string;
  qType: QType;
  label: string;
  required: boolean;
  options: string[]; // choice 전용
};

export type SurveyInitial = {
  id: number;
  title: string;
  description: string;
  status: "draft" | "open" | "closed";
  collectTeam: number;
  questions: { section: string | null; qType: QType; label: string; required: number; options: string[] }[];
};

const EMPTY_Q: QRow = { section: "", qType: "scale5", label: "", required: true, options: [] };

export function SurveyComposer({ initial, questionsLocked }: { initial?: SurveyInitial; questionsLocked?: boolean }) {
  const router = useRouter();
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<"draft" | "open" | "closed">(initial?.status ?? "draft");
  const [collectTeam, setCollectTeam] = useState(initial ? initial.collectTeam === 1 : true);
  const [questions, setQuestions] = useState<QRow[]>(
    initial
      ? initial.questions.map((q) => ({
          section: q.section ?? "",
          qType: q.qType,
          label: q.label,
          required: q.required === 1,
          options: q.options ?? [],
        }))
      : [{ ...EMPTY_Q }],
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 엑셀 업로드 → 서버 파싱 → 문항 주입(기존 문항이 있으면 교체 확인).
  async function onPickExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setError(null);
    setNotice(null);
    const hasContent = questions.some((q) => q.label.trim());
    if (hasContent && !confirm("기존 문항을 엑셀 내용으로 교체할까요?")) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/surveys/import-questions", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof d.error === "string" ? d.error : "엑셀을 읽을 수 없습니다"); return; }
      const parsed = (d.questions ?? []) as {
        section: string | null;
        qType: QType;
        label: string;
        required: boolean;
        options: string[];
      }[];
      setQuestions(parsed.map((q) => ({
        section: q.section ?? "",
        qType: q.qType,
        label: q.label,
        required: !!q.required,
        options: q.options ?? [],
      })));
      const warns = (d.warnings ?? []) as string[];
      setNotice(
        `문항 ${parsed.length}개를 가져왔습니다.` +
          (warns.length ? ` ${warns.length}건 건너뜀 — ${warns.slice(0, 3).join(" / ")}${warns.length > 3 ? " …" : ""}` : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "엑셀 업로드 실패");
    } finally {
      setImporting(false);
    }
  }

  function update(i: number, patch: Partial<QRow>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addQ() {
    setQuestions((prev) => [...prev, { ...EMPTY_Q }]);
  }
  function removeQ(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError("제목을 입력하세요"); return; }
    if (questions.length === 0) { setError("문항을 1개 이상 추가하세요"); return; }
    for (const q of questions) {
      if (!q.label.trim()) { setError("내용이 비어있는 문항이 있습니다"); return; }
      if (q.qType === "choice" && q.options.filter((o) => o.trim()).length < 2) {
        setError(`객관식 문항은 보기를 2개 이상 입력하세요: "${q.label}"`); return;
      }
    }

    const payload = {
      title: title.trim(),
      description,
      status,
      collectTeam,
      questions: questions.map((q) => ({
        section: q.section.trim() || null,
        qType: q.qType,
        label: q.label.trim(),
        required: q.required,
        options: q.qType === "choice" ? q.options.filter((o) => o.trim()) : [],
      })),
    };

    startSave(async () => {
      try {
        const url = isEdit ? `/api/surveys/${initial!.id}` : "/api/surveys";
        const res = await fetch(url, {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setError(typeof d.error === "string" ? d.error : "저장 실패"); return; }
        if (d.questionsLocked) {
          alert("응답이 있는 설문이라 제목·상태 등만 수정되고 문항은 변경되지 않았습니다.");
        }
        router.push("/surveys");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <div className="space-y-1.5">
            <Label>설문 제목</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 교육 중간만족도 조사" />
          </div>
          <div className="space-y-1.5">
            <Label>상태</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">작성중(비공개)</SelectItem>
                <SelectItem value="open">진행중(응답 가능)</SelectItem>
                <SelectItem value="closed">마감</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>설명 / 안내문</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="응답자에게 보여줄 안내 문구 (목적, 소요시간, 익명 안내 등)"
            className="min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={collectTeam} onChange={(e) => setCollectTeam(e.target.checked)} className="h-4 w-4" />
          응답 시작 시 작목·팀 선택 받기 (반익명)
        </label>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-base">문항 ({questions.length})</Label>
            {questionsLocked ? (
              <span className="text-xs text-amber-600">※ 이미 응답이 있어 문항은 수정해도 반영되지 않습니다.</span>
            ) : (
              <div className="flex items-center gap-2">
                <a
                  href="/api/surveys/template"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> 양식 다운로드
                </a>
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onPickExcel} />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> {importing ? "불러오는 중..." : "엑셀로 문항 올리기"}
                </Button>
              </div>
            )}
          </div>
          {notice && <p className="text-xs text-emerald-600">{notice}</p>}

          {questions.map((q, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground w-6">{i + 1}</span>
                <div className="flex-1 grid gap-2 md:grid-cols-[140px_1fr_150px]">
                  <Input value={q.section} onChange={(e) => update(i, { section: e.target.value })} placeholder="섹션(선택) 예:강사" className="h-9" />
                  <Input value={q.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="문항 내용" className="h-9" />
                  <Select value={q.qType} onValueChange={(v) => update(i, { qType: v as QType })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(QTYPE_LABEL) as QType[]).map((t) => (
                        <SelectItem key={t} value={t}>{QTYPE_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} title="위로" className="p-1.5 text-muted-foreground hover:text-foreground"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} title="아래로" className="p-1.5 text-muted-foreground hover:text-foreground"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => removeQ(i)} title="삭제" className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>
              </div>

              {q.qType === "choice" && (
                <div className="pl-8 space-y-1.5">
                  <Label className="text-xs">보기 (한 줄에 하나씩)</Label>
                  <textarea
                    value={q.options.join("\n")}
                    onChange={(e) => update(i, { options: e.target.value.split("\n") })}
                    placeholder={"보기1\n보기2\n보기3"}
                    className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}

              <label className="pl-8 flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} className="h-3.5 w-3.5" />
                필수 응답
              </label>
            </div>
          ))}

          <Button type="button" variant="secondary" size="sm" onClick={addQ}><Plus className="h-4 w-4" /> 문항 추가</Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>취소</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? "저장 중..." : "저장"}</Button>
        </div>
      </form>
    </Card>
  );
}
