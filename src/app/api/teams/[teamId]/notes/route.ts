import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";

// 특이사항 작성·삭제 권한: 관리자 또는 (자기 팀) 코디네이터
function canEditNotes(role: string | undefined, sessionTeamId: number | null | undefined, teamId: number): boolean {
  if (role === "admin") return true;
  if (role === "coordinator") return sessionTeamId === teamId;
  return false;
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "잘못된 팀" }, { status: 400 });
  if (!canEditNotes(session.role, session.teamId, teamId)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const noteDate = String(body.noteDate ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(noteDate)) return NextResponse.json({ error: "날짜를 입력하세요" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "내용을 입력하세요" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "내용이 너무 깁니다(2000자 이내)" }, { status: 400 });

  const [row] = await db
    .insert(schema.teamNotes)
    .values({
      teamId,
      noteDate,
      content,
      createdBy: session.userId ?? null,
      createdByName: session.name ?? null,
    })
    .returning({ id: schema.teamNotes.id });

  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireAuth();
  const { teamId: teamIdStr } = await params;
  const teamId = Number(teamIdStr);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "잘못된 팀" }, { status: 400 });
  if (!canEditNotes(session.role, session.teamId, teamId)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  await db
    .delete(schema.teamNotes)
    .where(and(eq(schema.teamNotes.id, id), eq(schema.teamNotes.teamId, teamId)));

  return NextResponse.json({ ok: true });
}
