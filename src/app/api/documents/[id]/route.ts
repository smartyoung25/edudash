import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { deleteDriveFile } from "@/lib/integrations/drive";

export const runtime = "nodejs";

// 서류 삭제 (admin 전용) — DB 레코드 삭제 + Drive 파일 휴지통 이동(best-effort)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const docId = Number(id);
  if (!docId) return NextResponse.json({ error: "잘못된 id" }, { status: 400 });

  const rows = await db.select().from(schema.documents).where(eq(schema.documents.id, docId)).limit(1);
  const doc = rows[0];
  if (!doc) return NextResponse.json({ error: "서류 없음" }, { status: 404 });

  // Drive 파일 휴지통 이동 (실패해도 DB 삭제는 진행)
  let drive = "Drive 파일 없음";
  if (doc.filePath) {
    const r = await deleteDriveFile(doc.filePath);
    drive = r.message;
  }

  await db.delete(schema.documents).where(eq(schema.documents.id, docId));
  return NextResponse.json({ ok: true, drive });
}
