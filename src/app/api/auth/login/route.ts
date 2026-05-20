import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getSession } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import type { Role } from "@/lib/permissions";

// ── [C-1] SESSION_PASSWORD 검증은 instrumentation.ts(register) 에서 일괄 처리 ──

// ── [C-1/H-3] 브루트포스 방어 — Turso 영속 카운터 ──
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15분
const PASSWORD_MAX_LEN = 128; // [M-4] bcrypt CPU DoS 방어

async function readAttempt(key: string) {
  const rows = await db
    .select()
    .from(schema.loginAttempts)
    .where(eq(schema.loginAttempts.key, key))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertAttempt(key: string, count: number, lockedUntil: number) {
  const now = Date.now();
  // libSQL upsert via onConflictDoUpdate
  await db
    .insert(schema.loginAttempts)
    .values({ key, count, lockedUntil, lastAttemptAt: now })
    .onConflictDoUpdate({
      target: schema.loginAttempts.key,
      set: { count, lockedUntil, lastAttemptAt: now },
    });
}

async function clearAttempt(key: string) {
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, key));
}

async function checkAndIncrement(key: string): Promise<{ blocked: boolean; remaining: number }> {
  const now = Date.now();
  const rec = await readAttempt(key);

  if (rec && rec.lockedUntil > now) {
    return { blocked: true, remaining: Math.ceil((rec.lockedUntil - now) / 60000) };
  }

  const count = rec && rec.lockedUntil <= now && rec.lockedUntil > 0 ? 1 : (rec?.count ?? 0) + 1;

  if (count >= MAX_ATTEMPTS) {
    await upsertAttempt(key, count, now + LOCK_DURATION_MS);
    return { blocked: true, remaining: 15 };
  }

  await upsertAttempt(key, count, 0);
  return { blocked: false, remaining: MAX_ATTEMPTS - count };
}

const GENERIC_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  let email: string | undefined;
  let password: string | undefined;

  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // [M-4] 과대 입력 차단
  if (password.length > PASSWORD_MAX_LEN || email.length > 254) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // [H-3] IP+email 키와 계정 단독 키를 함께 검사 (IP 회전 공격 대응)
  const ipKey = `${ip}:${email}`;
  const acctKey = `email:${email}`;

  const ipCheck = await checkAndIncrement(ipKey);
  const acctCheck = await checkAndIncrement(acctKey);
  const blocked = ipCheck.blocked || acctCheck.blocked;
  const remaining = Math.max(ipCheck.remaining, acctCheck.remaining);

  if (blocked) {
    await writeAuditLog({
      userEmail: email,
      action: "LOGIN_LOCKED",
      detail: { ip, remainingMinutes: remaining },
      ipAddress: ip,
    });
    return NextResponse.json(
      { error: `로그인 시도 횟수를 초과했습니다. ${remaining}분 후 다시 시도해주세요.` },
      { status: 429 },
    );
  }

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await writeAuditLog({
      userEmail: email,
      action: "LOGIN_FAIL",
      detail: { ip, reason: !user ? "user_not_found" : "wrong_password" },
      ipAddress: ip,
    });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await clearAttempt(ipKey);
  await clearAttempt(acctKey);

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role as Role;
  session.teamId = user.teamId;
  await session.save();

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: "LOGIN_SUCCESS",
    detail: { ip, role: user.role },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
