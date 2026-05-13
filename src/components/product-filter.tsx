"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRODUCTS, type Product } from "@/lib/teams";

interface Props {
  selected: Product | "전체";
  onSelect: (p: Product | "전체") => void;
  counts: Record<string, number>;
}

export function ProductFilter({ selected, onSelect, counts }: Props) {
  const items: (Product | "전체")[] = ["전체", ...PRODUCTS];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => {
        const active = selected === p;
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-2",
              active
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-background text-muted-foreground hover:bg-accent border-border",
            )}
          >
            {p}
            <Badge variant={active ? "outline" : "muted"} className={active ? "bg-white/20 text-white border-white/30" : ""}>
              {counts[p] ?? 0}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
