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

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_PASSWORD ||
    "fallback-development-password-change-me-in-env-local-32chars-min",
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
