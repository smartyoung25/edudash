import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const ip = getClientIp(req);

  let currentPassword: string;
  let newPassword: string;
  try {
    const body = await req.json();
    currentPassword = String(body.currentPassword ?? "");
    newPassword = String(body.newPassword ?? "");
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (newPassword.length < PASSWORD_MIN) {
    return NextResponse.json({ error: `새 비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다` }, { status: 400 });
  }
  if (newPassword.length > PASSWORD_MAX) {
    return NextResponse.json({ error: "비밀번호가 너무 깁니다" }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "현재 비밀번호와 다른 값을 사용하세요" }, { status: 400 });
  }

  const rows = await db.select().from(schema.users).where(eq(schema.users.id, session.userId!)).limit(1);
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "PASSWORD_CHANGE_FAIL",
      detail: { ip, reason: "wrong_current_password" },
      ipAddress: ip,
    });
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(schema.users).set({ passwordHash: newHash }).where(eq(schema.users.id, user.id));

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: "PASSWORD_CHANGE_SUCCESS",
    detail: { ip },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
