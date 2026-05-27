import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function HeroBar({
  greeting,
  riskSummary,
}: {
  greeting: string;
  riskSummary: string | null;   // null이면 위험 없음으로 표시
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      {riskSummary ? (
        <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
      ) : (
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">{greeting}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {riskSummary ?? "현재 즉시 조치가 필요한 항목이 없습니다."}
        </div>
      </div>
    </div>
  );
}
