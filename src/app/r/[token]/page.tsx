import { db, schema } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { pickNearestSessionNo } from "@/lib/expense";
import { QrEntryForm } from "./entry-form";

export const dynamic = "force-dynamic";

export default async function QrEntryPage({ params }: { params: Promise<{ token: string }> }) {
  const session = await requireAuth();   // 미로그인이면 /login 으로 리다이렉트
  const { token } = await params;

  const row = (await db.select().from(schema.teamQrTokens)
    .where(and(eq(schema.teamQrTokens.token, token), isNull(schema.teamQrTokens.revokedAt)))
    .limit(1))[0];
  if (!row) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">QR 만료</h1>
          <p className="text-sm text-muted-foreground">이 QR은 더 이상 유효하지 않습니다. 운영팀에 새 QR을 요청하세요.</p>
        </div>
      </div>
    );
  }

  const team = (await db.select().from(schema.teams).where(eq(schema.teams.id, row.teamId)).limit(1))[0];
  if (!team) redirect("/dashboard");

  const sessions = await db.select({ sessionNo: schema.sessions.sessionNo, scheduledDate: schema.sessions.scheduledDate })
    .from(schema.sessions).where(eq(schema.sessions.teamId, team.id));

  const today = new Date().toISOString().slice(0, 10);
  const suggestedSessionNo = pickNearestSessionNo(today, sessions) ?? 1;

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="max-w-md mx-auto p-4 space-y-3">
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">{session.role === "professor" ? "주임교수" : session.role === "coordinator" ? "코디" : "관리자"} · {session.name}</div>
          <h1 className="text-lg font-semibold">{team.name} 일일보고</h1>
          <p className="text-xs text-muted-foreground">오늘({today}) 가장 가까운 차시는 {suggestedSessionNo}차시로 자동 선택됨</p>
        </div>
        <QrEntryForm
          teamId={team.id}
          teamName={team.name}
          headCount={team.headCount}
          defaultDate={today}
          defaultSessionNo={suggestedSessionNo}
        />
      </div>
    </div>
  );
}
