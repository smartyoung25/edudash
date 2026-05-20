import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type SessionOptions } from "iron-session";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import type { Role } from "./permissions";

export interface SessionData {
  userId?: number;
  email?: string;
  name?: string;
  role?: Role;
  teamId?: number | null;
}

// [C-3] SESSION_PASSWORD 미설정 시 개발 환경 전용 임시 키 사용
// 운영 환경에서는 login/route.ts 상단에서 서버 시작을 차단함
const SESSION_PASSWORD =
  process.env.SESSION_PASSWORD ??
  (process.env.NODE_ENV !== "production"
    ? "dev-only-insecure-key-do-not-use-in-production-32ch"
    : (() => { throw new Error("[보안] SESSION_PASSWORD 환경변수가 필요합니다"); })());

export const sessionOptions: SessionOptions = {
  password: SESSION_PASSWORD,
  cookieName: "growth_edu_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  return session;
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  return rows[0] ?? null;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) redirect("/login");
  return session;
}

export async function requireRole(allowed: Role[]) {
  const session = await requireAuth();
  if (!session.role || !allowed.includes(session.role)) {
    redirect("/dashboard");
  }
  return session;
}
