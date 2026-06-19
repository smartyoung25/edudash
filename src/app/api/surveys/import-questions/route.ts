import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseQuestionsFromWorkbook } from "@/lib/survey-xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 4 * 1024 * 1024; // 서버리스 body 한도(~4.5MB) 고려

// 업로드된 xlsx 를 파싱해 빌더가 채울 문항 배열을 반환(DB 미접근, 순수 파싱).
export async function POST(req: NextRequest) {
  await requireRole(["admin"]);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const f = form.get("file");
  const file = f && typeof f !== "string" ? (f as File) : null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "엑셀(.xlsx) 파일만 올릴 수 있습니다" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "파일이 너무 큽니다(최대 4MB)" }, { status: 413 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { questions, warnings } = await parseQuestionsFromWorkbook(buf);
    return NextResponse.json({ ok: true, questions, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "엑셀을 읽을 수 없습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
