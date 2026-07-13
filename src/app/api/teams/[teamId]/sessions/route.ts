import { NextResponse } from "next/server";
import { and, eq, ne, max } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { canManageSessions } from "@/lib/permissions";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const STATUSES = ["planned", "in-progress", "done"] as const;

function validSubject(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= 200;
}

function validDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "잘못된 팀" }, { status: 400 });
  if (!canManageSessions(session.role!)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const scheduledDate = String(body.scheduledDate ?? "").trim();
  if (!validSubject(subject)) return NextResponse.json({ error: "주제를 입력하세요(200자 이내)" }, { status: 400 });
  if (!validDate(scheduledDate)) return NextResponse.json({ error: "예정일을 입력하세요(YYYY-MM-DD)" }, { status: 400 });

  let sessionNo = body.sessionNo != null && body.sessionNo !== "" ? Number(body.sessionNo) : null;
  if (sessionNo != null && (!Number.isFinite(sessionNo) || sessionNo < 1)) {
    return NextResponse.json({ error: "잘못된 회차 번호" }, { status: 400 });
  }

  if (sessionNo == null) {
    const [row] = await db
      .select({ maxNo: max(schema.sessions.sessionNo) })
      .from(schema.sessions)
      .where(eq(schema.sessions.teamId, teamId));
    sessionNo = (row?.maxNo ?? 0) + 1;
  } else {
    const dup = await db.select({ id: schema.sessions.id }).from(schema.sessions)
      .where(and(eq(schema.sessions.teamId, teamId), eq(schema.sessions.sessionNo, sessionNo)))
      .limit(1);
    if (dup[0]) return NextResponse.json({ error: `${sessionNo}회차가 이미 존재합니다` }, { status: 409 });
  }

  const [row] = await db.insert(schema.sessions).values({
    teamId,
    sessionNo,
    subject,
    scheduledDate,
  }).returning({ id: schema.sessions.id });

  await writeAuditLog({
    userId: session.userId ?? null,
    userEmail: session.email ?? null,
    action: "SESSION_CREATE",
    targetType: "session",
    targetId: row.id,
    detail: { teamId, sessionNo, subject, scheduledDate },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ ok: true, id: row.id, sessionNo });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "잘못된 팀" }, { status: 400 });
  if (!canManageSessions(session.role!)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  const existing = await db.select().from(schema.sessions)
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.teamId, teamId))).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  const allowed: Partial<typeof schema.sessions.$inferInsert> = {};

  if (body.subject !== undefined) {
    const subject = String(body.subject).trim();
    if (!validSubject(subject)) return NextResponse.json({ error: "주제를 입력하세요(200자 이내)" }, { status: 400 });
    allowed.subject = subject;
  }
  if (body.scheduledDate !== undefined) {
    const scheduledDate = String(body.scheduledDate).trim();
    if (!validDate(scheduledDate)) return NextResponse.json({ error: "예정일 형식이 잘못됐습니다(YYYY-MM-DD)" }, { status: 400 });
    allowed.scheduledDate = scheduledDate;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "잘못된 상태값" }, { status: 400 });
    allowed.status = body.status;
  }
  if (body.sessionNo !== undefined) {
    const sessionNo = Number(body.sessionNo);
    if (!Number.isFinite(sessionNo) || sessionNo < 1) return NextResponse.json({ error: "잘못된 회차 번호" }, { status: 400 });
    if (sessionNo !== existing[0].sessionNo) {
      const dup = await db.select({ id: schema.sessions.id }).from(schema.sessions)
        .where(and(eq(schema.sessions.teamId, teamId), eq(schema.sessions.sessionNo, sessionNo), ne(schema.sessions.id, id)))
        .limit(1);
      if (dup[0]) return NextResponse.json({ error: `${sessionNo}회차가 이미 존재합니다` }, { status: 409 });
    }
    allowed.sessionNo = sessionNo;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "변경할 항목 없음" }, { status: 400 });
  }

  await db.update(schema.sessions).set(allowed).where(eq(schema.sessions.id, id));

  await writeAuditLog({
    userId: session.userId ?? null,
    userEmail: session.email ?? null,
    action: "SESSION_UPDATE",
    targetType: "session",
    targetId: id,
    detail: { teamId, ...allowed },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "잘못된 팀" }, { status: 400 });
  if (!canManageSessions(session.role!)) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  const existing = await db.select().from(schema.sessions)
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.teamId, teamId))).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));

  await writeAuditLog({
    userId: session.userId ?? null,
    userEmail: session.email ?? null,
    action: "SESSION_DELETE",
    targetType: "session",
    targetId: id,
    detail: { teamId, sessionNo: existing[0].sessionNo, subject: existing[0].subject },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
