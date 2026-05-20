import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { requireRole, requireAuth } from "@/lib/auth";
import { generateWeeklyReport } from "@/lib/reports";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const WeekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD");

export async function POST(req: NextRequest) {
  const session = await requireRole(["admin", "coordinator"]);
  const ip = getClientIp(req);

  let weekStart: string;
  try {
    const body = await req.json();
    const parsed = WeekStartSchema.safeParse(body.weekStart);
    if (!parsed.success) {
      return NextResponse.json({ error: "weekStart 형식이 올바르지 않습니다 (YYYY-MM-DD)" }, { status: 400 });
    }
    weekStart = parsed.data;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  // [M-4] 날짜 범위 검증 (너무 과거/미래 차단)
  const parsed = new Date(weekStart);
  const now = new Date();
  const diffYears = Math.abs(now.getFullYear() - parsed.getFullYear());
  if (isNaN(parsed.getTime()) || diffYears > 2) {
    return NextResponse.json({ error: "유효하지 않은 날짜입니다" }, { status: 400 });
  }

  try {
    const buf = await generateWeeklyReport(weekStart);
    // 파일명에서 경로 조작 문자 제거
    const safeDate = weekStart.replace(/[^0-9-]/g, "");
    const fileName = `weekly_${safeDate}.xlsx`;

    await db.insert(schema.reportHistory).values({
      weekStart,
      filePath: fileName,
      generatedBy: session.userId,
    });

    await writeAuditLog({
      userId: session.userId,
      userEmail: session.email,
      action: "REPORT_GENERATE",
      detail: { weekStart, fileName },
      ipAddress: ip,
    });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err) {
    console.error("[REPORT_GENERATE]", err);
    return NextResponse.json({ error: "보고서 생성에 실패했습니다" }, { status: 500 });
  }
}

// [H-3] GET에도 인증 필수 (이전엔 인증 없음)
export async function GET() {
  await requireAuth();
  const history = await db.select().from(schema.reportHistory);
  return NextResponse.json({ history });
}
