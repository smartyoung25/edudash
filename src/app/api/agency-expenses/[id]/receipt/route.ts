import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const rows = await db.select().from(schema.agencyExpenses).where(eq(schema.agencyExpenses.id, Number(id))).limit(1);
  const e = rows[0];
  if (!e || !e.receiptFilePath) return NextResponse.json({ error: "파일 없음" }, { status: 404 });
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
