"use client";

import { useMemo, useState } from "react";
import { TeamCard, type TeamCardData } from "@/components/team-card";
import { ProductFilter } from "@/components/product-filter";
import { PRODUCTS, type Product } from "@/lib/teams";

export function DashboardClient({ teams }: { teams: TeamCardData[] }) {
  const [filter, setFilter] = useState<Product | "전체">("전체");

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: teams.length };
    for (const p of PRODUCTS) c[p] = teams.filter((t) => t.product === p).length;
    return c;
  }, [teams]);

  const filtered = filter === "전체" ? teams : teams.filter((t) => t.product === filter);

  return (
    <div className="space-y-4">
      <ProductFilter selected={filter} onSelect={setFilter} counts={counts} />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((t) => (
          <TeamCard key={t.id} team={t} compact />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center text-muted-foreground py-12">해당 품목의 운영 팀이 없습니다</div>
      )}
    </div>
  );
}
