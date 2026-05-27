import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";
import { pickNearestSessionNo, AUTO_SESSION_CATEGORIES } from "@/lib/expense";

export async function POST(req: Request) {
  const session = await requireAuth();
  const body = await req.json();
  const {
    teamId, sessionNo, spentDate, category,
    supplyAmount, vatAmount,
    vendorType, vendorBizNo, vendorName, vendorCeo, memo, docType,
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

  let resolvedSessionNo: number | null = sessionNo ? Number(sessionNo) : null;
  if (resolvedSessionNo == null && AUTO_SESSION_CATEGORIES.has(category)) {
    const sessions = await db.select({ sessionNo: schema.sessions.sessionNo, scheduledDate: schema.sessions.scheduledDate })
      .from(schema.sessions).where(eq(schema.sessions.teamId, Number(teamId)));
    resolvedSessionNo = pickNearestSessionNo(spentDate, sessions);
  }

  const [row] = await db.insert(schema.expenses).values({
    teamId: Number(teamId),
    sessionNo: resolvedSessionNo,
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
    docType: (docType === "거래명세표" || docType === "세금계산서") ? docType : "영수증",
  }).returning({ id: schema.expenses.id });

  return NextResponse.json({ ok: true, id: row.id });
}

export async function PATCH(req: Request) {
  const session = await requireAuth();
  const body = await req.json();
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  // 권한 — team-scoped 역할은 자기 팀 expense만
  const existingRows = await db
    .select({ teamId: schema.expenses.teamId })
    .from(schema.expenses)
    .where(eq(schema.expenses.id, id))
    .limit(1);
  if (!existingRows[0]) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (isTeamScoped(session.role!) && existingRows[0].teamId !== session.teamId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 허용 필드만 화이트리스트
  const allowed: Partial<typeof schema.expenses.$inferInsert> = {};
  if (body.spentDate !== undefined) allowed.spentDate = String(body.spentDate);
  if (body.category !== undefined) allowed.category = body.category;
  if (body.vendorName !== undefined) allowed.vendorName = body.vendorName || null;
  if (body.vendorCeo !== undefined) allowed.vendorCeo = body.vendorCeo || null;
  if (body.vendorBizNo !== undefined) allowed.vendorBizNo = body.vendorBizNo || null;
  if (body.vendorType !== undefined) allowed.vendorType = body.vendorType || null;
  if (body.memo !== undefined) allowed.memo = body.memo || null;
  if (body.docType !== undefined) {
    allowed.docType = (body.docType === "거래명세표" || body.docType === "세금계산서") ? body.docType : "영수증";
  }
  // 금액: supply+vat 들어오면 total은 합으로 재계산. total 단독 전달도 허용 (수기 강제 입력)
  if (body.supplyAmount !== undefined || body.vatAmount !== undefined) {
    const supply = Number(body.supplyAmount) || 0;
    const vat = Number(body.vatAmount) || 0;
    allowed.supplyAmount = supply;
    allowed.vatAmount = vat;
    allowed.totalAmount = (body.totalAmount !== undefined ? Number(body.totalAmount) : supply + vat) || 0;
  } else if (body.totalAmount !== undefined) {
    allowed.totalAmount = Number(body.totalAmount) || 0;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "변경할 항목 없음" }, { status: 400 });
  }

  await db.update(schema.expenses).set(allowed).where(eq(schema.expenses.id, id));
  return NextResponse.json({ ok: true });
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
