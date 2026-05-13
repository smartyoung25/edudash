import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";

export async function POST(req: Request) {
  await requireAuth();
  const body = await req.json();
  if (!body.teamId || !body.reportDate || !body.sessionNo) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  try {
    await db.insert(schema.dailyReports).values({
      teamId: body.teamId,
      reportDate: body.reportDate,
      sessionNo: body.sessionNo,
      subject: body.subject ?? null,
      attended: body.attended ?? 0,
      absent: body.absent ?? 0,
      absentNames: body.absentNames ?? null,
      absentReason: body.absentReason ?? null,
      notes: body.notes ?? null,
      source: body.source ?? "manual",
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "저장 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
