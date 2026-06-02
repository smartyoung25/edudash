import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";

export async function POST(req: Request) {
  await requireRole(["admin"]);
  const body = await req.json().catch(() => ({}));
  const { teamId, docType } = body;
  // 단건(id) 또는 일괄(ids[]) 모두 지원
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Boolean)
    : body.id
      ? [Number(body.id)]
      : [];
  if (!ids.length || !teamId || !docType) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  await db
    .update(schema.documents)
    .set({ teamId, docType })
    .where(inArray(schema.documents.id, ids));
  return NextResponse.json({ ok: true, count: ids.length });
}
