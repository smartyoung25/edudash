"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2 } from "lucide-react";
import { PRODUCTS } from "@/lib/teams";
import { SCALE5_OPTIONS, type QType } from "@/lib/survey";

export type PublicQuestion = {
  id: number;
  section: string | null;
  qType: QType;
  label: string;
  required: boolean;
  options: string[];
};

export function ResponseForm({
  token,
  collectTeam,
  questions,
  teamsByProduct,
}: {
  token: string;
  collectTeam: boolean;
  questions: PublicQuestion[];
  teamsByProduct: Record<string, string[]>;
}) {
  const [product, setProduct] = useState("");
  const [teamName, setTeamName] = useState("");
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSaving, startSave] = useTransition();

  const teamOptions = useMemo(() => (product ? teamsByProduct[product] ?? [] : []), [product, teamsByProduct]);

  function setVal(qId: number, v: string) {
    setValues((prev) => ({ ...prev, [qId]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (collectTeam && !product) { setError("작목을 선택하세요."); return; }
    for (const q of questions) {
      if (q.required && !(values[q.id] && values[q.id].trim() !== "")) {
        setError(`필수 문항에 응답하세요: ${q.label}`);
        return;
      }
    }

    const answers = questions
      .filter((q) => values[q.id] != null && values[q.id] !== "")
      .map((q) =>
        q.qType === "scale5"
          ? { questionId: q.id, valueInt: Number(values[q.id]) }
          : { questionId: q.id, valueText: values[q.id] },
      );

    startSave(async () => {
      try {
        const res = await fetch(`/api/s/${token}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product: collectTeam ? product : null,
            teamName: collectTeam ? (teamName || null) : null,
            answers,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setError(typeof d.error === "string" ? d.error : "제출 실패"); return; }
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "제출 실패");
      }
    });
  }

  if (done) {
    return (
      <Card className="p-8 text-center space-y-2">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
        <h2 className="text-lg font-semibold">응답해 주셔서 감사합니다!</h2>
        <p className="text-sm text-muted-foreground">소중한 의견은 교육 개선에 활용됩니다.</p>
      </Card>
    );
  }

  let lastSection: string | null = null;

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-5">
        {collectTeam && (
          <div className="grid gap-3 sm:grid-cols-2 rounded-lg border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <Label>작목 <span className="text-destructive">*</span></Label>
              <Select value={product} onValueChange={(v) => { setProduct(v); setTeamName(""); }}>
                <SelectTrigger><SelectValue placeholder="작목 선택" /></SelectTrigger>
                <SelectContent>
                  {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>팀 (선택)</Label>
              {teamOptions.length > 0 ? (
                <Select value={teamName} onValueChange={setTeamName}>
                  <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                  <SelectContent>
                    {teamOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="팀명 직접 입력(선택)" />
              )}
            </div>
          </div>
        )}

        {questions.map((q, i) => {
          const showSection = q.section && q.section !== lastSection;
          if (q.section) lastSection = q.section;
          return (
            <div key={q.id} className="space-y-2">
              {showSection && (
                <div className="pt-2 text-sm font-semibold text-emerald-700 border-b pb-1">{q.section}</div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium leading-relaxed">
                  {i + 1}. {q.label} {q.required && <span className="text-destructive">*</span>}
                </Label>

                {q.qType === "scale5" && (
                  <RadioGroup
                    value={values[q.id] ?? ""}
                    onValueChange={(v) => setVal(q.id, v)}
                    className="flex flex-wrap gap-x-4 gap-y-2 pl-1"
                  >
                    {SCALE5_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <RadioGroupItem value={String(opt.value)} />
                        <span>{opt.value} {opt.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                )}

                {q.qType === "choice" && (
                  <RadioGroup value={values[q.id] ?? ""} onValueChange={(v) => setVal(q.id, v)} className="pl-1">
                    {q.options.map((o) => (
                      <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value={o} />
                        <span>{o}</span>
                      </label>
                    ))}
                  </RadioGroup>
                )}

                {q.qType === "short" && (
                  <Input value={values[q.id] ?? ""} onChange={(e) => setVal(q.id, e.target.value)} placeholder="답변 입력" />
                )}

                {q.qType === "long" && (
                  <textarea
                    value={values[q.id] ?? ""}
                    onChange={(e) => setVal(q.id, e.target.value)}
                    placeholder="자유롭게 입력해 주세요"
                    className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm"
                  />
                )}
              </div>
            </div>
          );
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isSaving}>{isSaving ? "제출 중..." : "제출하기"}</Button>
      </form>
    </Card>
  );
}
