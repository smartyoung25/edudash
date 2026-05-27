import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/dashboard/sparkline";
import { ArrowDown, ArrowUp, Minus, ChevronRight } from "lucide-react";

export type StatCardAccent = "emerald" | "blue" | "amber" | "rose" | "violet" | "orange";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
  accent = "emerald",
  delta,
  sparkline,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ElementType;
  className?: string;
  accent?: StatCardAccent;
  /** 전주 대비 변화량 (pp 또는 절대치). null이면 표시 안함. */
  delta?: number | null;
  /** 60px 스파크라인 데이터 포인트 (0~100 범위 또는 절대 숫자). */
  sparkline?: number[];
  /** 카드 전체를 클릭 영역으로 만들고 이 경로로 이동. 없으면 일반 카드. */
  href?: string | null;
}) {
  const accentClass = {
    emerald: "bg-emerald-100 text-emerald-700",
    blue: "bg-sky-100 text-sky-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    violet: "bg-violet-100 text-violet-700",
    orange: "bg-orange-100 text-orange-700",
  }[accent];

  const sparkColor = {
    emerald: "#10b981", blue: "#0ea5e9", amber: "#f59e0b",
    rose: "#f43f5e", violet: "#8b5cf6", orange: "#f97316",
  }[accent];

  const body = (
    <CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            {label}
            {href && <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />}
          </div>
          <div className="mt-1 text-3xl font-bold tracking-tight">{value}</div>
          {(hint || delta !== undefined) && (
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
              {delta !== undefined && delta !== null && <DeltaBadge delta={delta} />}
              {hint && <span>{hint}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", accentClass)}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 h-[40px] -mb-1">
          <Sparkline data={sparkline} color={sparkColor} />
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} aria-label={`${label} 상세 보기`}
        className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg">
        <Card className={cn("transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-300 cursor-pointer h-full", className)}>
          {body}
        </Card>
      </Link>
    );
  }

  return (
    <Card className={cn("", className)}>
      {body}
    </Card>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="h-3 w-3" />0</span>;
  }
  if (delta > 0) {
    return <span className="inline-flex items-center gap-0.5 text-emerald-700"><ArrowUp className="h-3 w-3" />{delta}</span>;
  }
  return <span className="inline-flex items-center gap-0.5 text-rose-700"><ArrowDown className="h-3 w-3" />{Math.abs(delta)}</span>;
}
