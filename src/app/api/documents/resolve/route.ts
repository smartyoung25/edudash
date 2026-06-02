import { NextResponse } from "next/server";
import { inArray, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { processReceiptCandidate } from "@/lib/integrations/imap-receipts";
import { downloadDriveFile, extractDriveFileId } from "@/lib/integrations/drive";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await requireRole(["admin"]);
  const body = await req.json().catch(() => ({}));
  const { teamId, docType, agencyKind } = body;
  // 단건(id) 또는 일괄(ids[]) 모두 지원
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Boolean)
    : body.id
      ? [Number(body.id)]
      : [];
  if (!ids.length) return NextResponse.json({ error: "대상 없음" }, { status: 400 });

  // ── 기관경비(출장비/기타경비)로 분류 → 기관정산 반영 ──
  if (agencyKind === "출장비" || agencyKind === "기타경비") {
    const docs = await db.select().from(schema.documents).where(inArray(schema.documents.id, ids));
    const teams = await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams);
    let created = 0, filed = 0;
    const errors: string[] = [];

    for (const d of docs) {
      // 미분류에서 빼고 경비영수증으로 정리 (기관경비는 팀 없음)
      await db.update(schema.documents)
        .set({ teamId: null, docType: "경비영수증" })
        .where(eq(schema.documents.id, d.id));

      // 이미지/PDF 영수증이면 OCR 후 기관정산에 등록
      const ext = (d.fileName.toLowerCase().match(/\.(pdf|jpe?g|png)$/)?.[0]) ?? "";
      const fileId = d.filePath ? extractDriveFileId(d.filePath) : null;
      if (ext && fileId) {
        const dl = await downloadDriveFile(fileId);
        if (dl.ok) {
          const outcome = await processReceiptCandidate(
            { name: d.fileName, buf: dl.buf, mime: ext === ".pdf" ? "application/pdf" : undefined },
            {
              teamId: 0,
              fromAddr: d.emailFrom ?? "",
              subject: d.emailSubject ?? d.fileName,
              messageId: `doc:${d.id}`,
              receivedAt: d.receivedAt ?? new Date().toISOString(),
              subjectSession: null,
              teams,
              forceAgencyKind: agencyKind,
            },
          );
          if (outcome.status === "created") created++;
          else if (outcome.status === "error") errors.push(`${d.fileName}: ${outcome.detail}`);
          else filed++;
        } else {
          filed++;
          errors.push(`${d.fileName}: ${dl.message}`);
        }
      } else {
        // OCR 불가(엑셀/한글 등) — 문서만 정리
        filed++;
      }
    }
    const message = `기관경비(${agencyKind}) 처리 — 정산등록 ${created}건, 문서정리 ${filed}건` + (errors.length ? `, 오류 ${errors.length}건` : "");
    return NextResponse.json({ ok: true, message, created, filed, errors: errors.slice(0, 10) });
  }

  // ── 팀 분류 ──
  if (!teamId || !docType) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  await db
    .update(schema.documents)
    .set({ teamId, docType })
    .where(inArray(schema.documents.id, ids));
  return NextResponse.json({ ok: true, count: ids.length });
}
