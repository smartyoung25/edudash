import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { uploadDocumentToDrive } from "@/lib/integrations/drive";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS = ["출장비", "기타경비"] as const;

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.match(/\.jpe?g/)) return "image/jpeg";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

export async function POST(req: Request) {
  await requireRole(["admin"]);
  const ctype = req.headers.get("content-type") || "";
  let body: any = {};
  let file: File | null = null;

  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    body = Object.fromEntries(form.entries());
    const f = form.get("receipt");
    if (f && f instanceof File && f.size > 0) file = f;
  } else {
    body = await req.json();
  }

  const { kind, spentDate, supplyAmount, vatAmount, vendorType, vendorBizNo, vendorName, vendorCeo, cardType, cardLast4, payerName, memo, tripName, teamId } = body;
  if (!kind || !KINDS.includes(kind as any)) return NextResponse.json({ error: "잘못된 분류" }, { status: 400 });
  if (!spentDate) return NextResponse.json({ error: "사용일 필수" }, { status: 400 });

  const supply = Number(supplyAmount) || 0;
  const vat = Number(vatAmount) || 0;
  const total = supply + vat;

  // 영수증 파일은 로컬 디스크가 아니라 항상 Drive에 저장 (Vercel 서버리스는 파일시스템이 읽기 전용)
  let receiptFilePath: string | null = null;
  let receiptMimeType: string | null = null;
  if (file) {
    const buf = Buffer.from(await file.arrayBuffer());
    const month = Number(String(spentDate).slice(5, 7)) || null;
    const up = await uploadDocumentToDrive({
      teamName: (tripName as string | undefined) || kind,
      docType: "경비영수증",
      month,
      fileName: file.name || `receipt_${Date.now()}`,
      bytes: buf,
    });
    if (up.ok && up.fileId) {
      receiptFilePath = `drive:${up.fileId}`;
      receiptMimeType = file.type || guessMime(file.name);
    } else {
      return NextResponse.json({ error: `영수증 업로드 실패: ${up.message}` }, { status: 500 });
    }
  }

  const [row] = await db.insert(schema.agencyExpenses).values({
    kind: kind as "출장비" | "기타경비",
    spentDate,
    supplyAmount: supply, vatAmount: vat, totalAmount: total,
    vendorType: (vendorType || null) as any,
    vendorBizNo: vendorBizNo || null,
    vendorName: vendorName || null,
    vendorCeo: vendorCeo || null,
    cardType: (cardType || null) as any,
    cardLast4: cardLast4 || null,
    payerName: payerName || null,
    memo: memo || null,
    tripName: tripName || null,
    teamId: teamId ? Number(teamId) : null,
    receiptFilePath,
    receiptMimeType,
  }).returning({ id: schema.agencyExpenses.id });
  return NextResponse.json({ ok: true, id: row.id });
}

const PATCHABLE = new Set([
  "spentDate", "supplyAmount", "vatAmount", "totalAmount",
  "vendorName", "vendorBizNo", "vendorCeo", "vendorType",
  "cardType", "cardLast4", "payerName",
  "subcategory", "tripName", "docType", "memo", "teamId",
]);
const NUMERIC = new Set(["supplyAmount", "vatAmount", "totalAmount"]);

export async function PATCH(req: Request) {
  await requireRole(["admin"]);
  const body = await req.json();
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "id" || !PATCHABLE.has(k)) continue;
    if (k === "teamId") { updates.teamId = v === "" || v == null ? null : Number(v); continue; }
    updates[k] = NUMERIC.has(k) ? (Number(v) || 0) : (v === "" ? null : v);
  }
  // 공급가/부가세 수정 시 집행액 자동 재계산 (totalAmount 명시값이 없으면)
  if (("supplyAmount" in updates || "vatAmount" in updates) && !("totalAmount" in updates)) {
    const [cur] = await db.select().from(schema.agencyExpenses).where(eq(schema.agencyExpenses.id, id)).limit(1);
    if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
    const s = "supplyAmount" in updates ? updates.supplyAmount : cur.supplyAmount;
    const v = "vatAmount" in updates ? updates.vatAmount : cur.vatAmount;
    updates.totalAmount = s + v;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  await db.update(schema.agencyExpenses).set(updates).where(eq(schema.agencyExpenses.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireRole(["admin"]);
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });
  await db.delete(schema.agencyExpenses).where(eq(schema.agencyExpenses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
