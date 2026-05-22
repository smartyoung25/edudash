import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await requireAuth();
  const body = await req.json();
  const {
    teamId, sessionNo, spentDate, category,
    supplyAmount, vatAmount,
    vendorType, vendorBizNo, vendorName, vendorCeo, memo,
  } = body;

  if (!teamId || !spentDate || !category) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  if (isTeamScoped(session.role!) && session.teamId !== Number(teamId)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const supply = Number(supplyAmount) || 0;
  const vat = Number(vatAmount) || 0;
  const total = supply + vat;

  const [row] = await db.insert(schema.expenses).values({
    teamId: Number(teamId),
    sessionNo: sessionNo ? Number(sessionNo) : null,
    spentDate,
    category,
    supplyAmount: supply,
    vatAmount: vat,
    totalAmount: total,
    vendorType: vendorType || null,
    vendorBizNo: vendorBizNo || null,
    vendorName: vendorName || null,
    vendorCeo: vendorCeo || null,
    memo: memo || null,
  }).returning({ id: schema.expenses.id });

  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request) {
  const session = await requireAuth();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  if (isTeamScoped(session.role!)) {
    const rows = await db.select({ teamId: schema.expenses.teamId })
      .from(schema.expenses).where(eq(schema.expenses.id, Number(id))).limit(1);
    if (!rows[0] || rows[0].teamId !== session.teamId) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
  }

  await db.delete(schema.expenses).where(eq(schema.expenses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
