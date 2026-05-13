import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";

export async function POST(req: Request) {
  await requireRole(["admin"]);
  const { id, teamId, docType } = await req.json();
  if (!id || !teamId || !docType) return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });

  await db
    .update(schema.documents)
    .set({ teamId, docType })
    .where(eq(schema.documents.id, id));
  return NextResponse.json({ ok: true });
}
