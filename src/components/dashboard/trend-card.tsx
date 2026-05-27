"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

interface TrendPoint { weekStart: string; avgProgress: number }
interface ProductBar { product: string; avgProgress: number; teamCount: number }

export function TrendCard({
  trend,
  byProduct,
  className = "",
}: {
  trend: TrendPoint[];
  byProduct: ProductBar[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="p-4 border-b">
        <div className="text-sm font-semibold">진행률 추이</div>
        <div className="text-xs text-muted-foreground mt-0.5">최근 8주 + 품목별 비교</div>
      </div>
      <Tabs defaultValue="trend" className="p-4">
        <TabsList className="mb-3">
          <TabsTrigger value="trend">주차별 추세</TabsTrigger>
          <TabsTrigger value="product">품목별 비교</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="h-[260px]">
          {trend.every((p) => p.avgProgress === 0) ? (
            <EmptyState text="스냅샷 데이터가 누적되면 추세가 표시됩니다 (매주 월요일 09:05 자동 적재)" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="weekStart" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip formatter={(v: number) => [`${v}%`, "평균 진행률"]} labelFormatter={(v) => `주차 시작: ${v}`} />
                <ReferenceLine y={80} stroke="#94a3b8" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="avgProgress" stroke="#10b981" strokeWidth={2} fill="url(#trendGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="product" className="h-[260px]">
          {byProduct.length === 0 ? (
            <EmptyState text="품목별 팀 데이터가 없습니다" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProduct} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="product" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip formatter={(v: number, _n, ctx: any) => [`${v}% (${ctx.payload.teamCount}팀)`, "평균 진행률"]} />
                <Bar dataKey="avgProgress" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-6">{text}</div>;
}
