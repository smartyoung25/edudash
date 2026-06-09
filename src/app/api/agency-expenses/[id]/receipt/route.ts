import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { downloadDriveFile, uploadDocumentToDrive } from "@/lib/integrations/drive";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const rows = await db.select().from(schema.agencyExpenses).where(eq(schema.agencyExpenses.id, Number(id))).limit(1);
  const e = rows[0];
  if (!e || !e.receiptFilePath) return NextResponse.json({ error: "파일 없음" }, { status: 404 });

  // Drive에 저장된 영수증 (drive:<fileId>) — 클라우드에서 스트리밍
  if (e.receiptFilePath.startsWith("drive:")) {
    const dl = await downloadDriveFile(e.receiptFilePath.slice("drive:".length));
    if (!dl.ok) return NextResponse.json({ error: "Drive 파일 조회 실패" }, { status: 404 });
    return new NextResponse(new Uint8Array(dl.buf), {
      headers: {
        "Content-Type": e.receiptMimeType || dl.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const fullPath = path.join(process.cwd(), e.receiptFilePath);
  if (!fs.existsSync(fullPath)) return NextResponse.json({ error: "디스크에 없음" }, { status: 404 });
  const buf = fs.readFileSync(fullPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": e.receiptMimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// 기존 기관경비 행에 영수증 파일 첨부(미첨부/누락 보완) — Drive 업로드 후 drive:<fileId> 저장
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const rows = await db.select().from(schema.agencyExpenses).where(eq(schema.agencyExpenses.id, Number(id))).limit(1);
  const e = rows[0];
  if (!e) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  const form = await req.formData();
  const f = form.get("receipt");
  const file = f && typeof f !== "string" ? (f as File) : null;
  if (!file) return NextResponse.json({ error: "영수증 파일 누락" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const month = Number(String(e.spentDate).slice(5, 7)) || null;
  const up = await uploadDocumentToDrive({
    teamName: e.tripName ?? e.kind,
    docType: "경비영수증",
    month,
    fileName: file.name || `receipt_${id}`,
    bytes: buf,
  });
  if (!up.ok || !up.fileId) {
    return NextResponse.json({ error: `영수증 업로드 실패: ${up.message}` }, { status: 500 });
  }

  await db.update(schema.agencyExpenses)
    .set({ receiptFilePath: `drive:${up.fileId}`, receiptMimeType: file.type || null })
    .where(eq(schema.agencyExpenses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
