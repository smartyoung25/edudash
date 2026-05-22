import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const KINDS = ["출장비", "기타경비"] as const;
const RECEIPTS_DIR = "data/receipts/agency-travel";

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function pickExt(name: string) {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g|bmp)$/);
  return m ? `.${m[1]}` : ".bin";
}
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

  const { kind, spentDate, supplyAmount, vatAmount, vendorType, vendorBizNo, vendorName, vendorCeo, cardType, cardLast4, payerName, memo } = body;
  if (!kind || !KINDS.includes(kind as any)) return NextResponse.json({ error: "잘못된 분류" }, { status: 400 });
  if (!spentDate) return NextResponse.json({ error: "사용일 필수" }, { status: 400 });

  const supply = Number(supplyAmount) || 0;
  const vat = Number(vatAmount) || 0;
  const total = supply + vat;

  // 영수증 파일 저장
  let receiptFilePath: string | null = null;
  let receiptMimeType: string | null = null;
  if (file) {
    ensureDir(RECEIPTS_DIR);
    const ext = pickExt(file.name);
    const safeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rel = path.join(RECEIPTS_DIR, `${safeId}${ext}`).replace(/\\/g, "/");
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(rel, buf);
    receiptFilePath = rel;
    receiptMimeType = file.type || guessMime(file.name);
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
    receiptFilePath,
    receiptMimeType,
  }).returning({ id: schema.agencyExpenses.id });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request) {
  await requireRole(["admin"]);
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });
  await db.delete(schema.agencyExpenses).where(eq(schema.agencyExpenses.id, Number(id)));
  return NextResponse.json({ ok: true });
}
