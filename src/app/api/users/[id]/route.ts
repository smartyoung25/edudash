import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import type { Role } from "@/lib/permissions";

const VALID_ROLES: Role[] = ["admin", "coordinator", "professor"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["admin"]);
  const ip = getClientIp(req);
  const id = Number((await params).id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  let body: { name?: string; role?: string; teamId?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const updates: Partial<{ name: string; role: Role; teamId: number | null }> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "이름을 입력하세요" }, { status: 400 });
    updates.name = name;
  }
  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: "올바른 역할이 아닙니다" }, { status: 400 });
    }
    updates.role = body.role as Role;
  }
  if (body.teamId !== undefined) {
    updates.teamId = body.teamId === null ? null : Number(body.teamId);
    if (updates.teamId !== null && Number.isNaN(updates.teamId)) {
      return NextResponse.json({ error: "팀 ID 형식 오류" }, { status: 400 });
    }
  }
  if ((updates.role === "coordinator" || updates.role === "professor") && updates.teamId === null) {
    return NextResponse.json({ error: "코디네이터·주임교수는 담당 팀이 필요합니다" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "변경 사항이 없습니다" }, { status: 400 });
  }

  const r = await db.update(schema.users).set(updates).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
  if (r.length === 0) return NextResponse.json({ error: "존재하지 않는 사용자" }, { status: 404 });

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "USER_UPDATE",
    detail: { targetUserId: id, updates, ip },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["admin"]);
  const ip = getClientIp(req);
  const id = Number((await params).id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  // 자기 자신 삭제 방지
  if (id === session.userId) {
    return NextResponse.json({ error: "자기 자신은 삭제할 수 없습니다" }, { status: 400 });
  }

  const r = await db.delete(schema.users).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
  if (r.length === 0) return NextResponse.json({ error: "존재하지 않는 사용자" }, { status: 404 });

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "USER_DELETE",
    detail: { targetUserId: id, ip },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
