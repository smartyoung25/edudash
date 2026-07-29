import { NextResponse } from "next/server";
import { ocrReceipt, isOcrEnabled } from "@/lib/integrations/ocr";
import { classifyExpense } from "@/lib/integrations/expense-classifier";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel 서버리스 body 한도(~4.5MB)를 고려한 안전 상한
const MAX_SIZE = 4 * 1024 * 1024;

export async function POST(req: Request) {
  await requireAuth();
  if (!isOcrEnabled()) {
    return NextResponse.json({ error: "OCR이 설정되지 않았습니다 (.env.local GOOGLE_VISION_KEY_PATH)" }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "파일이 너무 큽니다(최대 4MB). 사진 용량을 줄여 다시 첨부해주세요" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || undefined;

  try {
    const parsed = await ocrReceipt(buf, mime);
    const classification = classifyExpense({
      text: parsed.rawText,
      vendorName: parsed.vendorName,
      spentTime: parsed.spentTime,
    });
    return NextResponse.json({ ok: true, parsed, classification });
  } catch (err: any) {
    console.error("[OCR] 실패", err);
    return NextResponse.json({ error: err?.message || "OCR 처리 실패" }, { status: 500 });
  }
}
