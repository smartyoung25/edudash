import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { canUploadDocument } from "@/lib/permissions"; // admin | coordinator 만 KPI 편집
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const UpdateSchema = z.object({
  memberId: z.number().int().positive(),
  kpiDefId: z.number().int().positive(),
  value: z.number().min(0).max(100),
  type: z.enum(["checkpoint", "final"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await requireAuth();
  const ip = getClientIp(req);

  // [H-1] KPI 편집은 admin / coordinator 만 가능 (교수 제외)
  if (!canUploadDocument(session.role!)) {
    return NextResponse.json({ error: "KPI 편집 권한이 없습니다" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { memberId, kpiDefId, value, type, date } = parsed.data;

  // progress 행 존재 확인
  const rows = await db
    .select({ id: schema.kpiProgress.id, midCheckpoints: schema.kpiProgress.midCheckpoints })
    .from(schema.kpiProgress)
    .where(and(eq(schema.kpiProgress.memberId, memberId), eq(schema.kpiProgress.kpiDefId, kpiDefId)));

  if (rows.length === 0) {
    return NextResponse.json({ error: "KPI 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  // [H-1] coordinator는 자기 팀 멤버만 수정 가능
  if (session.role === "coordinator" && session.teamId != null) {
    const memberRow = await db
      .select({ teamId: schema.members.teamId })
      .from(schema.members)
      .where(eq(schema.members.id, memberId))
      .limit(1);

    if (memberRow.length === 0 || memberRow[0].teamId !== session.teamId) {
      await writeAuditLog({
        userId: session.userId,
        userEmail: session.email,
        action: "KPI_UPDATE",
        targetType: "member",
        targetId: memberId,
        detail: { blocked: true, reason: "team_scope_violation" },
        ipAddress: ip,
      });
      return NextResponse.json({ error: "담당 팀 교육생의 KPI만 수정할 수 있습니다" }, { status: 403 });
    }
  }

  const row = rows[0];

  try {
    if (type === "final") {
      await db
        .update(schema.kpiProgress)
        .set({ finalValue: value })
        .where(and(eq(schema.kpiProgress.memberId, memberId), eq(schema.kpiProgress.kpiDefId, kpiDefId)));
    } else {
      const checkpoints: { round: number; value: number; date: string }[] = JSON.parse(row.midCheckpoints);
      const today = date ?? new Date().toISOString().slice(0, 10);
      const existIdx = checkpoints.findIndex((c) => c.date === today);
      if (existIdx >= 0) {
        checkpoints[existIdx].value = value;
      } else {
        checkpoints.push({ round: checkpoints.length + 1, value, date: today });
      }
      await db
        .update(schema.kpiProgress)
        .set({ midCheckpoints: JSON.stringify(checkpoints) })
        .where(and(eq(schema.kpiProgress.memberId, memberId), eq(schema.kpiProgress.kpiDefId, kpiDefId)));
    }

    await writeAuditLog({
      userId: session.userId,
      userEmail: session.email,
      action: "KPI_UPDATE",
      targetType: "member",
      targetId: memberId,
      detail: { kpiDefId, value, type, date },
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[KPI_UPDATE]", err);
    return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 });
  }
}
