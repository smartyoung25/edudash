import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseCardCsv, ingestCardCsv } from "@/lib/integrations/card-reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  await requireRole(["admin"]);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "CSV 파일이 필요합니다" }, { status: 400 });

  const text = await file.text();
  const parsed = parseCardCsv(text);
  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return NextResponse.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await ingestCardCsv(parsed.rows, batchId);

  return NextResponse.json({
    ok: true,
    batchId,
    parsed: { headers: parsed.headers, mapping: parsed.mapping, rowCount: parsed.rows.length, parseErrors: parsed.errors },
    result,
  });
}
