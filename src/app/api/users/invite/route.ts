import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import type { Role } from "@/lib/permissions";

const VALID_ROLES: Role[] = ["admin", "coordinator", "professor"];
const INVITE_TTL_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getBaseUrl(req: NextRequest): string {
  // 1) NEXT_PUBLIC_APP_URL 우선 (운영 정확한 도메인)
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  // 2) 헤더 fallback
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "app.seongjangnong.org";
  return `${proto}://${host}`;
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

  // 이미 등록된 이메일 확인
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "이미 가입된 이메일입니다" }, { status: 409 });
  }

  // 미사용 초대장이 있으면 무효화 (1인 1활성)
  await db
    .update(schema.userInvites)
    .set({ usedAt: Date.now() })
    .where(eq(schema.userInvites.email, email));

  // 토큰 발급
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000;

  await db.insert(schema.userInvites).values({
    tokenHash,
    email,
    name,
    role: role as Role,
    teamId,
    invitedBy: session.userId ?? null,
    expiresAt,
  });

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "INVITE_CREATE",
    detail: { targetEmail: email, role, teamId, ip },
    ipAddress: ip,
  });

  const url = `${getBaseUrl(req)}/invite/${token}`;
  return NextResponse.json({
    ok: true,
    url,
    expiresAt,
    email,
    name,
  });
}
