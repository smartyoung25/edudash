import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { isTeamScoped } from "@/lib/permissions";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const DailySchema = z.object({
  teamId: z.number().int().positive(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD"),
  sessionNo: z.number().int().min(1).max(200),
  subject: z.string().max(200).optional().nullable(),
  attended: z.number().int().min(0).max(500).default(0),
  absent: z.number().int().min(0).max(500).default(0),
  absentNames: z.string().max(500).optional().nullable(),
  absentReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  source: z.enum(["sheet", "manual"]).default("manual"),
});

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const ip = getClientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  // [M-1] Zod 입력 검증
  const parsed = DailySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;

  // [H-1] 팀 범위 권한 검증 — 코디/교수는 자기 팀만
  if (isTeamScoped(session.role!)) {
    if (session.teamId !== data.teamId) {
      await writeAuditLog({
        userId: session.userId,
        userEmail: session.email,
        action: "DAILY_CREATE",
        targetType: "team",
        targetId: data.teamId,
        detail: { blocked: true, reason: "team_scope_violation", myTeam: session.teamId },
        ipAddress: ip,
      });
      return NextResponse.json({ error: "담당 팀의 데이터만 입력할 수 있습니다" }, { status: 403 });
    }
  }

  try {
    await db.insert(schema.dailyReports).values({
      teamId: data.teamId,
      reportDate: data.reportDate,
      sessionNo: data.sessionNo,
      subject: data.subject ?? null,
      attended: data.attended,
      absent: data.absent,
      absentNames: data.absentNames ?? null,
      absentReason: data.absentReason ?? null,
      notes: data.notes ?? null,
      source: data.source,
    });

    await writeAuditLog({
      userId: session.userId,
      userEmail: session.email,
      action: "DAILY_CREATE",
      targetType: "team",
      targetId: data.teamId,
      detail: { reportDate: data.reportDate, sessionNo: data.sessionNo, attended: data.attended },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    // [M-2] 내부 에러 메시지 노출 차단
    console.error("[DAILY_CREATE]", err);
    const isDuplicate = err instanceof Error && err.message.includes("UNIQUE");
    return NextResponse.json(
      { error: isDuplicate ? "이미 해당 날짜·차시의 보고가 존재합니다" : "저장에 실패했습니다" },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireAuth();
  const ip = getClientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const parsed = DailySchema.partial().extend({ id: z.number().int().positive() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id, teamId, ...updates } = parsed.data;

  // teamId가 주어진 경우 팀 범위 검증
  if (teamId && isTeamScoped(session.role!)) {
    if (session.teamId !== teamId) {
      return NextResponse.json({ error: "담당 팀의 데이터만 수정할 수 있습니다" }, { status: 403 });
    }
  }

  try {
    await db
      .update(schema.dailyReports)
      .set({ ...updates })
      .where(eq(schema.dailyReports.id, id!));

    await writeAuditLog({
      userId: session.userId,
      userEmail: session.email,
      action: "DAILY_UPDATE",
      targetType: "daily_report",
      targetId: id,
      detail: updates,
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DAILY_UPDATE]", err);
    return NextResponse.json({ error: "수정에 실패했습니다" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  await requireAuth();
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");

  const rows = teamId
    ? await db
        .select()
        .from(schema.dailyReports)
        .where(eq(schema.dailyReports.teamId, Number(teamId)))
    : await db.select().from(schema.dailyReports);

  return NextResponse.json({ reports: rows });
}
