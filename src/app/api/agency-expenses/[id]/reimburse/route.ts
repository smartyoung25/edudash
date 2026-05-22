import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, note } = body as { status?: "미정산" | "정산완료"; note?: string };

  const now = new Date().toISOString();
  await db.update(schema.agencyExpenses)
    .set({
      reimburseStatus: status === "정산완료" ? "정산완료" : "미정산",
      reimbursedAt: status === "정산완료" ? now : null,
      reimburseNote: note ?? null,
    })
    .where(eq(schema.agencyExpenses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
