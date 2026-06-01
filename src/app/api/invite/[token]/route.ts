import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "유효하지 않은 초대 링크" }, { status: 400 });
  }
  const tokenHash = hashToken(token);
  const rows = await db.select().from(schema.userInvites).where(eq(schema.userInvites.tokenHash, tokenHash)).limit(1);
  const invite = rows[0];
  if (!invite) {
    return NextResponse.json({ error: "유효하지 않은 초대 링크입니다" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: "이미 사용된 초대 링크입니다" }, { status: 410 });
  }
  if (invite.expiresAt < Date.now()) {
    return NextResponse.json({ error: "초대 링크가 만료되었습니다 (관리자에게 새 링크 요청)" }, { status: 410 });
  }
  // 팀 이름도 같이 (있으면)
  let teamName: string | null = null;
  if (invite.teamId) {
    const t = await db.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, invite.teamId)).limit(1);
    teamName = t[0]?.name ?? null;
  }
  return NextResponse.json({
    ok: true,
    email: invite.email,
    name: invite.name,
    role: invite.role,
    teamName,
  });
}
