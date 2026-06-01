import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getSession } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import type { Role } from "@/lib/permissions";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(req);
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "유효하지 않은 초대 링크" }, { status: 400 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const password = String(body.password ?? "");
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json({ error: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다` }, { status: 400 });
  }
  if (password.length > PASSWORD_MAX) {
    return NextResponse.json({ error: "비밀번호가 너무 깁니다" }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const rows = await db.select().from(schema.userInvites).where(eq(schema.userInvites.tokenHash, tokenHash)).limit(1);
  const invite = rows[0];
  if (!invite) return NextResponse.json({ error: "유효하지 않은 초대 링크입니다" }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: "이미 사용된 초대 링크입니다" }, { status: 410 });
  if (invite.expiresAt < Date.now()) return NextResponse.json({ error: "초대 링크가 만료되었습니다" }, { status: 410 });

  // 동일 이메일 사용자 존재 시 거부 (중복 가입 방지)
  const exists = await db.select().from(schema.users).where(eq(schema.users.email, invite.email)).limit(1);
  if (exists.length > 0) {
    // 초대도 무효화
    await db.update(schema.userInvites).set({ usedAt: Date.now() }).where(eq(schema.userInvites.id, invite.id));
    return NextResponse.json({ error: "이미 가입된 이메일입니다" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await db
    .insert(schema.users)
    .values({
      email: invite.email,
      passwordHash,
      name: invite.name,
      role: invite.role as Role,
      teamId: invite.teamId ?? null,
    })
    .returning({ id: schema.users.id });

  const newUserId = created[0]!.id;

  // 초대장 소진
  await db.update(schema.userInvites).set({ usedAt: Date.now() }).where(eq(schema.userInvites.id, invite.id));

  // 자동 로그인
  const session = await getSession();
  session.userId = newUserId;
  session.email = invite.email;
  session.name = invite.name;
  session.role = invite.role as Role;
  session.teamId = invite.teamId ?? null;
  await session.save();

  await writeAuditLog({
    userId: newUserId,
    userEmail: invite.email,
    action: "INVITE_ACCEPT",
    detail: { ip, role: invite.role, inviteId: invite.id },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
