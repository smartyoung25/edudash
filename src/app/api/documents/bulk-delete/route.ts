import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { deleteDriveFile } from "@/lib/integrations/drive";

export const runtime = "nodejs";

// 서류 일괄 삭제 (admin 전용) — DB 삭제 + Drive 파일 휴지통 이동(best-effort)
export async function POST(req: Request) {
  await requireRole(["admin"]);
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "ids 필요" }, { status: 400 });

  const docs = await db.select().from(schema.documents).where(inArray(schema.documents.id, ids));
  for (const d of docs) {
    if (d.filePath) {
      try { await deleteDriveFile(d.filePath); } catch {}
    }
  }
  await db.delete(schema.documents).where(inArray(schema.documents.id, ids));
  return NextResponse.json({ ok: true, count: docs.length });
}
