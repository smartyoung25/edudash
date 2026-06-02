import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";
import { downloadDriveFile } from "@/lib/integrations/drive";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const rows = await db.select().from(schema.expenses).where(eq(schema.expenses.id, Number(id))).limit(1);
  const e = rows[0];
  if (!e || !e.receiptFilePath) {
    return NextResponse.json({ error: "영수증 파일 없음" }, { status: 404 });
  }
  if (isTeamScoped(session.role!) && session.teamId !== e.teamId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // Drive에 저장된 영수증 (drive:<fileId>) — 클라우드에서 스트리밍
  if (e.receiptFilePath.startsWith("drive:")) {
    const dl = await downloadDriveFile(e.receiptFilePath.slice("drive:".length));
    if (!dl.ok) {
      return NextResponse.json({ error: "Drive 파일 조회 실패" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(dl.buf), {
      headers: {
        "Content-Type": e.receiptMimeType || dl.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const fullPath = path.join(process.cwd(), e.receiptFilePath);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "파일이 디스크에 없음" }, { status: 404 });
  }

  const buf = fs.readFileSync(fullPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": e.receiptMimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
