import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, note } = body as { status?: "미정산" | "정산완료"; note?: string };

  const rows = await db.select({ teamId: schema.expenses.teamId }).from(schema.expenses).where(eq(schema.expenses.id, Number(id))).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (isTeamScoped(session.role!) && session.teamId !== rows[0].teamId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const now = new Date().toISOString();
  await db.update(schema.expenses)
    .set({
      reimburseStatus: status === "정산완료" ? "정산완료" : "미정산",
      reimbursedAt: status === "정산완료" ? now : null,
      reimburseNote: note ?? null,
    })
    .where(eq(schema.expenses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
