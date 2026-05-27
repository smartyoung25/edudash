"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Users, GraduationCap } from "lucide-react";
import { PRODUCT_COLORS, type Product } from "@/lib/teams";
import { cn, formatMonthDay } from "@/lib/utils";
import type { RiskLevel } from "@/lib/dashboard-metrics";

export interface TeamCardData {
  id: number;
  name: string;
  product: Product;
  cohort: string;
  courseName: string;
  region: string;
  headCount: number;
  totalSessions: number;
  endDate: string;
  professorName: string;
  currentSession: number;
  progressPercent: number;
  cancelled?: number;
  risk?: RiskLevel;
}

const RISK_BORDER: Record<RiskLevel, string> = {
  high: "border-l-4 border-l-rose-500",
  mid: "border-l-4 border-l-amber-500",
  low: "",
};

export function TeamCard({ team, compact = false }: { team: TeamCardData; compact?: boolean }) {
  const padding = compact ? "p-4 space-y-3" : "p-5 space-y-4";
  const title = compact ? "text-base font-semibold" : "text-lg font-semibold";
  const percent = compact ? "text-xl font-bold" : "text-2xl font-bold";
  const riskCls = team.risk ? RISK_BORDER[team.risk] : "";

  return (
    <Link href={`/teams/${team.id}`}>
      <Card className={cn("group transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-300 cursor-pointer h-full", riskCls)}>
        <div className={padding}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn("border", PRODUCT_COLORS[team.product])}>{team.product}</Badge>
              <Badge variant="outline">{team.cohort}</Badge>
            </div>
            <span className="text-xs text-muted-foreground hidden md:inline">{team.courseName}</span>
          </div>

          <div>
            <h3 className={cn(title, "group-hover:text-emerald-700 transition-colors")}>{team.name}</h3>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">진행률</span>
              <span className={cn(percent, "text-emerald-600")}>{team.progressPercent}%</span>
            </div>
            <Progress value={team.progressPercent} indicatorClassName="bg-emerald-500" />
            <div className="text-xs text-muted-foreground">
              {team.currentSession}/{team.totalSessions}차시
              {team.cancelled ? ` · 취소 ${team.cancelled}` : ""}
              {" · "}최종 {formatMonthDay(team.endDate)}
            </div>
          </div>

          {!compact && (
            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{team.headCount}명</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{team.region}</span>
              <span className="flex items-center gap-1 hidden md:inline-flex"><GraduationCap className="h-3 w-3" />{team.professorName}</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
