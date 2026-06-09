"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Upload } from "lucide-react";

type Att = { fileId: string; fileName: string; mimeType?: string; sizeBytes?: number };

export function FormComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"코디전달" | "내부공유" | "기타">("내부공유");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<Att[]>([]);
  const [uploading, setUploading] = useState<{ name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function onPick(files: FileList | null) {
    if (!files) return;
    setPending((prev) => [...prev, ...Array.from(files)]);
  }

  async function doUpload() {
    setError(null);
    for (const f of pending) {
      setUploading({ name: f.name });
      try {
        const fd = new FormData();
        fd.append("category", category);
        fd.append("file", f);
        const res = await fetch("/api/forms/upload", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.fileId) throw new Error(typeof d.error === "string" ? d.error : "업로드 실패");
        setUploaded((prev) => [...prev, { fileId: d.fileId, fileName: d.fileName ?? f.name, mimeType: d.mimeType ?? (f.type || undefined), sizeBytes: d.sizeBytes ?? f.size }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드 실패");
        setUploading(null);
        return;
      }
    }
    setPending([]);
    setUploading(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("제목을 입력하세요"); return; }
    if (pending.length > 0) { setError("첨부 후 [업로드] 버튼을 먼저 눌러주세요"); return; }
    startSave(async () => {
      try {
        const res = await fetch("/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, category, attachments: uploaded }),
        });
        const d = await res.json();
        if (!res.ok) { setError(typeof d.error === "string" ? d.error : "저장 실패"); return; }
        router.push(`/forms/${d.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <div className="space-y-1.5">
            <Label>제목</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 6월 코디일지 양식" />
          </div>
          <div className="space-y-1.5">
            <Label>카테고리</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="코디전달">코디전달</SelectItem>
                <SelectItem value="내부공유">내부공유</SelectItem>
                <SelectItem value="기타">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>본문</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="안내문, 작성 가이드, 마감일 등 자유롭게 입력"
            className="min-h-[180px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>첨부파일</Label>
          <Input type="file" multiple onChange={(e) => onPick(e.target.files)} accept=".pdf,.hwp,.hwpx,.docx,.xlsx,.zip,.jpg,.jpeg,.png" />
          <div className="text-xs text-muted-foreground">파일을 선택한 뒤 아래 [업로드] 버튼을 눌러 Drive에 올린 후 저장하세요.</div>

          {pending.length > 0 && (
            <div className="mt-2 space-y-1 text-sm">
              {pending.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded border px-2 py-1">
                  <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)}KB)</span></span>
                  <button type="button" onClick={() => setPending(pending.filter((_, idx) => idx !== i))}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                </div>
              ))}
              <Button type="button" size="sm" variant="secondary" onClick={doUpload} disabled={uploading !== null}>
                <Upload className="h-4 w-4" /> {uploading ? "업로드 중..." : `${pending.length}개 업로드`}
              </Button>
            </div>
          )}

          {uploaded.length > 0 && (
            <div className="mt-2 space-y-1 text-sm">
              {uploaded.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded border bg-emerald-50 px-2 py-1">
                  <span className="truncate">✓ {a.fileName}</span>
                  <button type="button" onClick={() => setUploaded(uploaded.filter((_, idx) => idx !== i))}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                </div>
              ))}
            </div>
          )}
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
