import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import type { Role } from "@/lib/permissions";

const VALID_ROLES: Role[] = ["admin", "coordinator", "professor"];

function genPassword() {
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = crypto.randomBytes(10);
  let p = "";
  for (let i = 0; i < 10; i++) p += charset[buf[i] % charset.length];
  return p;
}

export async function GET() {
  await requireRole(["admin"]);
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      teamId: schema.users.teamId,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(schema.users.id);
  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["admin"]);
  const ip = getClientIp(req);

  let body: { email?: string; name?: string; role?: string; teamId?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "");
  const teamId = body.teamId === undefined || body.teamId === null ? null : Number(body.teamId);

  if (!email || !name) return NextResponse.json({ error: "이메일과 이름을 입력하세요" }, { status: 400 });
  if (email.length > 254) return NextResponse.json({ error: "이메일이 너무 깁니다" }, { status: 400 });
  if (!VALID_ROLES.includes(role as Role)) return NextResponse.json({ error: "올바른 역할이 아닙니다" }, { status: 400 });
  if ((role === "coordinator" || role === "professor") && !teamId) {
    return NextResponse.json({ error: "코디네이터·주임교수는 담당 팀이 필요합니다" }, { status: 400 });
  }
  if (teamId !== null && Number.isNaN(teamId)) {
    return NextResponse.json({ error: "팀 ID 형식 오류" }, { status: 400 });
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "이미 존재하는 이메일입니다" }, { status: 409 });
  }

  const tempPassword = genPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const inserted = await db
    .insert(schema.users)
    .values({ email, name, role: role as Role, teamId, passwordHash })
    .returning({ id: schema.users.id });

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "USER_CREATE",
    detail: { targetEmail: email, role, teamId, ip },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, id: inserted[0]?.id, tempPassword });
}
