import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildTemplateWorkbook, TEMPLATE_FILENAME } from "@/lib/survey-xlsx";

export const runtime = "nodejs";

// 설문 문항 입력용 표준 엑셀 양식 다운로드.
export async function GET() {
  await requireRole(["admin"]);
  const wb = buildTemplateWorkbook();
  const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(TEMPLATE_FILENAME)}`,
    },
  });
}
