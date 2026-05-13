import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
  accent = "emerald",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ElementType;
  className?: string;
  accent?: "emerald" | "blue" | "amber" | "rose";
}) {
  const accentClass = {
    emerald: "bg-emerald-100 text-emerald-700",
    blue: "bg-sky-100 text-sky-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  }[accent];

  return (
    <Card className={cn("", className)}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-bold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", accentClass)}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
