"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface KpiItem {
  kpiDefId: number;
  kpiName: string;
  targetValue: number;
  latest: number;
  percent: number;
}

interface Props {
  memberId: number;
  memberName: string;
  kpis: KpiItem[];
}

export function KpiEditButton({ memberId, memberName, kpis }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"checkpoint" | "final">("checkpoint");
  const [values, setValues] = useState<Record<number, string>>(
    Object.fromEntries(kpis.map((k) => [k.kpiDefId, String(k.latest)]))
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSave = () => {
    startTransition(async () => {
      const today = new Date().toISOString().slice(0, 10);
      const results = await Promise.all(
        kpis.map((k) =>
          fetch("/api/kpi/progress", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              memberId,
              kpiDefId: k.kpiDefId,
              value: Number(values[k.kpiDefId] ?? k.latest),
              type,
              date: today,
            }),
          })
        )
      );
      const allOk = results.every((r) => r.ok);
      if (allOk) {
        toast.success(`${memberName} KPI 저장 완료`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error("저장 중 오류가 발생했습니다");
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{memberName} — KPI 달성률 입력</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 저장 유형 */}
            <div>
              <Label className="text-sm font-medium mb-2 block">입력 유형</Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as "checkpoint" | "final")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="checkpoint" id="cp" />
                  <Label htmlFor="cp" className="text-sm cursor-pointer">중간점검</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="final" id="fin" />
                  <Label htmlFor="fin" className="text-sm cursor-pointer">최종 달성률</Label>
                </div>
              </RadioGroup>
            </div>

            {/* KPI별 달성률 입력 */}
            <div className="space-y-3">
              {kpis.map((k) => (
                <div key={k.kpiDefId}>
                  <Label className="text-xs text-muted-foreground mb-1 block truncate">
                    {k.kpiName}
                    <span className="ml-1 text-muted-foreground/60">
                      (목표 {k.targetValue}%)
                    </span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={values[k.kpiDefId] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [k.kpiDefId]: e.target.value }))
                      }
                      className="h-8 text-sm"
                      placeholder="0"
                    />
                    <span className="text-sm text-muted-foreground w-4">%</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      현재 {k.percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
