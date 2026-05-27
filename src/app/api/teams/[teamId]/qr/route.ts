import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, isNull, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/** 현재 활성 토큰 조회 (없으면 자동 발급) */
async function getOrCreateActiveToken(teamId: number): Promise<string> {
  const existing = await db.select().from(schema.teamQrTokens)
    .where(and(eq(schema.teamQrTokens.teamId, teamId), isNull(schema.teamQrTokens.revokedAt)))
    .limit(1);
  if (existing[0]) return existing[0].token;

  const token = randomBytes(16).toString("base64url");
  await db.insert(schema.teamQrTokens).values({ teamId, token });
  return token;
}

export async function POST(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  await requireRole(["admin"]);
  const { teamId } = await params;
  const id = parseInt(teamId, 10);
  if (!isFinite(id)) return NextResponse.json({ error: "invalid teamId" }, { status: 400 });

  // 기존 토큰 모두 회수 후 새로 발급 (rotate)
  await db.update(schema.teamQrTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(schema.teamQrTokens.teamId, id), isNull(schema.teamQrTokens.revokedAt)));
  const token = randomBytes(16).toString("base64url");
  await db.insert(schema.teamQrTokens).values({ teamId: id, token });
  return NextResponse.json({ ok: true, token });
}

export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  await requireRole(["admin"]);
  const { teamId } = await params;
  const id = parseInt(teamId, 10);
  if (!isFinite(id)) return NextResponse.json({ error: "invalid teamId" }, { status: 400 });

  const token = await getOrCreateActiveToken(id);
  return NextResponse.json({ ok: true, token });
}
