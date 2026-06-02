import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { processReceiptCandidate } from "@/lib/integrations/imap-receipts";
import { downloadDriveFile, extractDriveFileId } from "@/lib/integrations/drive";

export const runtime = "nodejs";
export const maxDuration = 60;

// 이미 수집된 경비영수증(documents)을 OCR 재처리하여 팀별/기관 정산에 반영.
// 멱등(중복방지): expenses.mailMessageId=`doc:<id>` / agency 는 memo 태그.
// 타임아웃 대비 limit 단위로 처리하고 남은 건수를 반환 — 버튼 반복 클릭으로 이어서 처리.
export async function POST(req: Request) {
  await requireRole(["admin"]);
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 40);

  const docs = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.docType, "경비영수증"));
  const teams = await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams);

  let attempted = 0, created = 0, duplicate = 0, skipped = 0, remaining = 0;
  const errors: string[] = [];

  for (const d of docs) {
    if (!d.teamId || !d.filePath) { skipped++; continue; }
    const fileId = extractDriveFileId(d.filePath);
    if (!fileId) { skipped++; continue; }

    // 팀 경비로 이미 처리된 건 빠르게 건너뜀 (재실행 시 진행)
    const done = await db
      .select({ id: schema.expenses.id })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.mailMessageId, `doc:${d.id}`), eq(schema.expenses.attachmentName, d.fileName)))
      .limit(1);
    if (done.length > 0) { duplicate++; continue; }

    if (attempted >= limit) { remaining++; continue; }
    attempted++;

    const dl = await downloadDriveFile(fileId);
    if (!dl.ok) { errors.push(`${d.fileName}: ${dl.message}`); continue; }
    const ext = (d.fileName.toLowerCase().match(/\.(pdf|jpe?g|png)$/)?.[0]) ?? "";
    const mime = ext === ".pdf" ? "application/pdf" : undefined;

    const outcome = await processReceiptCandidate(
      { name: d.fileName, buf: dl.buf, mime },
      {
        teamId: d.teamId,
        fromAddr: d.emailFrom ?? "",
        subject: d.emailSubject ?? d.fileName,
        messageId: `doc:${d.id}`,
        receivedAt: d.receivedAt ?? new Date().toISOString(),
        subjectSession: d.sessionNo ?? null,
        teams,
      },
    );
    if (outcome.status === "created") created++;
    else if (outcome.status === "duplicate") duplicate++;
    else if (outcome.status === "error") errors.push(`${d.fileName}: ${outcome.detail}`);
    else skipped++;
  }

  const message =
    `재처리 ${attempted}건 — 정산생성 ${created}, 중복 ${duplicate}, 건너뜀 ${skipped}, 오류 ${errors.length}` +
    (remaining > 0 ? ` · 남음 ~${remaining}건(버튼 다시 클릭)` : "");
  return NextResponse.json({ ok: true, message, created, duplicate, skipped, remaining, errors: errors.slice(0, 10) });
}
