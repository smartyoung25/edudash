import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { User, Users, Phone, Mail } from "lucide-react";

function avatarColor(name: string) {
  const colors = [
    "bg-emerald-100 text-emerald-700",
    "bg-sky-100 text-sky-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-violet-100 text-violet-700",
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

function calcAge(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const born = new Date(birthDate).getFullYear();
  const age = new Date().getFullYear() - born;
  return `${age}세`;
}

export default async function MembersTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);
  const members = await db.select().from(schema.members).where(eq(schema.members.teamId, tid));

  // Stats
  const total = members.length;
  const male = members.filter((m) => m.gender === "M").length;
  const female = members.filter((m) => m.gender === "F").length;
  const youthFarmer = members.filter((m) => m.learnerType === "청년농").length;
  const farmer = members.filter((m) => m.learnerType === "농업인").length;
  const active = members.filter((m) => m.eduStatus === "교육중" || !m.eduStatus).length;
  const cancelled = members.filter((m) => m.eduStatus === "교육취소").length;

  return (
    <div className="space-y-5">
      {/* 요약 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">전체 교육생</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-sky-600">{male}<span className="text-base font-normal text-muted-foreground">/{female}</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">남자 / 여자</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">{youthFarmer}</div>
          <div className="text-xs text-muted-foreground mt-0.5">청년농</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-violet-600">{farmer}</div>
          <div className="text-xs text-muted-foreground mt-0.5">농업인</div>
        </div>
      </div>

      {/* 교육생 카드 목록 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            교육중 {active}명{cancelled > 0 && ` · 취소 ${cancelled}명`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((m) => {
            const isCancelled = m.eduStatus === "교육취소";
            const age = calcAge(m.birthDate);
            return (
              <Card
                key={m.id}
                className={cn("p-4 transition-colors", isCancelled && "opacity-50 bg-muted/30")}
              >
                <div className="flex items-center gap-3">
                  {/* 이니셜 아바타 */}
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0",
                      isCancelled ? "bg-gray-100 text-gray-400" : avatarColor(m.name)
                    )}
                  >
                    {m.name.slice(0, 1)}
                  </div>

                  {/* 이름 + 배지들 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("font-medium text-sm", isCancelled && "line-through text-muted-foreground")}>
                        {m.name}
                      </span>
                      {isCancelled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                          취소
                        </span>
                      )}
                    </div>

                    {/* 데모그래픽 배지들 */}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {/* 성별 */}
                      {m.gender && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
                            m.gender === "M"
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : "bg-rose-50 text-rose-600 border-rose-200"
                          )}
                        >
                          {m.gender === "M" ? "남" : "여"}
                        </span>
                      )}

                      {/* 교육생 유형 */}
                      {m.learnerType === "청년농" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                          청년농
                        </span>
                      )}
                      {m.learnerType === "농업인" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-violet-50 text-violet-700 border-violet-200">
                          농업인
                        </span>
                      )}

                      {/* 나이 */}
                      {age && (
                        <span className="text-[10px] text-muted-foreground">
                          {age}
                        </span>
                      )}
                    </div>

                    {/* 연락처 */}
                    {(m.phone || m.email) && (
                      <div className="mt-1.5 space-y-0.5">
                        {m.phone && (
                          <a
                            href={`tel:${m.phone.replace(/-/g, "")}`}
                            className={cn(
                              "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors",
                              isCancelled && "pointer-events-none"
                            )}
                          >
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span className="tabular-nums">{m.phone}</span>
                          </a>
                        )}
                        {m.email && (
                          <a
                            href={`mailto:${m.email}`}
                            className={cn(
                              "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors",
                              isCancelled && "pointer-events-none"
                            )}
                          >
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{m.email}</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
