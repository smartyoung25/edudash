"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "members",   label: "팀원" },
  { key: "schedule",  label: "교육일정" },
  { key: "kpi",       label: "KPI" },
];

export function TeamTabs({ teamId }: { teamId: number }) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b -mb-5">
      {TABS.map((tab) => {
        const href = `/teams/${teamId}/${tab.key}`;
        const active = pathname === href || (tab.key === "members" && pathname === `/teams/${teamId}`);
        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-emerald-500 text-emerald-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
