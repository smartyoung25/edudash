import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/dashboard-metrics";

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const cls = {
    high: "bg-rose-100 text-rose-800 border-rose-200",
    mid: "bg-amber-100 text-amber-800 border-amber-200",
    low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  }[level];
  const text = level === "high" ? "고위험" : level === "mid" ? "주의" : "양호";
  return (
    <Badge variant="outline" className={cn("border", cls)}>
      {text}{score !== undefined ? ` ${score}` : ""}
    </Badge>
  );
}

export function riskAccentBorder(level: RiskLevel) {
  return level === "high" ? "border-l-4 border-l-rose-500"
    : level === "mid" ? "border-l-4 border-l-amber-500"
    : "";
}
