import { NextResponse } from "next/server";
import { ocrReceipt, isOcrEnabled } from "@/lib/integrations/ocr";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  await requireAuth();
  if (!isOcrEnabled()) {
    return NextResponse.json({ error: "OCR이 설정되지 않았습니다 (.env.local GOOGLE_VISION_KEY_PATH)" }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || undefined;

  try {
    const parsed = await ocrReceipt(buf, mime);
    return NextResponse.json({ ok: true, parsed });
  } catch (err: any) {
    console.error("[OCR] 실패", err);
    return NextResponse.json({ error: err?.message || "OCR 처리 실패" }, { status: 500 });
  }
}
