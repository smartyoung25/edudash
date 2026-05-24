import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await ctx.params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const rows = await db.select().from(schema.reportHistory).where(eq(schema.reportHistory.id, rowId)).limit(1);
  const r = rows[0];
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

  // file_path가 절대경로면 그대로, 아니면 cwd 기준 상대
  const abs = path.isAbsolute(r.filePath) ? r.filePath : path.join(process.cwd(), r.filePath);
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "file missing" }, { status: 410 });

  const buf = fs.readFileSync(abs);
  const fileName = path.basename(abs);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
