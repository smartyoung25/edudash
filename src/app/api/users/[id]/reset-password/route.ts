import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";

function genPassword() {
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = crypto.randomBytes(10);
  let p = "";
  for (let i = 0; i < 10; i++) p += charset[buf[i] % charset.length];
  return p;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["admin"]);
  const ip = getClientIp(req);
  const id = Number((await params).id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const tempPassword = genPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const r = await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
  if (r.length === 0) return NextResponse.json({ error: "존재하지 않는 사용자" }, { status: 404 });

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "USER_PASSWORD_RESET",
    detail: { targetUserId: id, ip },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, tempPassword });
}
