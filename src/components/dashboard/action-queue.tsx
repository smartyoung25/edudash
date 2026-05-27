import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { RiskBadge } from "./risk-badge";
import type { RiskyTeamRow } from "@/lib/dashboard-metrics";

export function ActionQueue({ rows, className = "" }: { rows: RiskyTeamRow[]; className?: string }) {
  return (
    <Card className={className}>
      <div className="p-4 border-b">
        <div className="text-sm font-semibold">조치 필요 팀</div>
        <div className="text-xs text-muted-foreground mt-0.5">위험도 점수 순. 행 클릭 → 팀 상세</div>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">즉시 조치가 필요한 팀이 없습니다.</div>
      ) : (
        <ul className="divide-y max-h-[480px] overflow-auto">
          {rows.map((r) => (
            <li key={r.teamId}>
              <Link
                href={`/teams/${r.teamId}`}
                className="flex items-start gap-3 p-3 hover:bg-muted/40 transition-colors"
              >
                <RiskBadge level={r.riskLevel} score={r.riskScore} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.teamName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.reasons.join(" · ")}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
