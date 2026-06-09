import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { canUploadDocument } from "@/lib/permissions";
import { uploadDocumentToDrive } from "@/lib/integrations/drive";
import { isDriveEnabled } from "@/lib/env";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel 서버리스 body 한도(~4.5MB)를 고려한 안전 상한
const MAX_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".hwp", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"];

const Schema = z.object({
  teamId: z.coerce.number().int().positive(),
  docType: z.enum(["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지", "미분류"]),
  month: z.coerce.number().int().min(1).max(12),
});

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[ -‮]/g, "").replace(/[\\/]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "untitled";
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

// 브라우저 → 서버 → Drive (서버 경유 업로드). 브라우저가 구글로 직접 PUT 하던 CORS 문제 회피.
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const ip = getClientIp(req);

  if (!canUploadDocument(session.role!)) {
    return NextResponse.json({ error: "서류 업로드 권한이 없습니다" }, { status: 403 });
  }
  if (!isDriveEnabled()) {
    return NextResponse.json({ error: "Drive 자격증명 미설정" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const parsed = Schema.safeParse({
    teamId: form.get("teamId"),
    docType: form.get("docType"),
    month: form.get("month"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { teamId, docType, month } = parsed.data;

  const f = form.get("file");
  const file = f && typeof f !== "string" ? (f as File) : null;
  if (!file) return NextResponse.json({ error: "파일 누락" }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "파일이 너무 큽니다(최대 4MB)" }, { status: 413 });
  }

  const fileName = sanitizeFileName(file.name || "untitled");
  const e = ext(fileName);
  if (!ALLOWED_EXT.includes(e)) {
    return NextResponse.json({ error: `허용되지 않는 형식: ${e}` }, { status: 400 });
  }

  const teamRow = await db
    .select({ name: schema.teams.name })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  if (teamRow.length === 0) {
    return NextResponse.json({ error: "팀을 찾을 수 없습니다" }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const up = await uploadDocumentToDrive({
    teamName: teamRow[0].name,
    docType,
    month,
    fileName,
    bytes,
  });
  if (!up.ok || !up.fileId) {
    return NextResponse.json({ error: `업로드 실패: ${up.message}` }, { status: 500 });
  }

  await db.insert(schema.documents).values({
    teamId,
    docType,
    month,
    fileName,
    filePath: up.webViewLink ?? up.fileId,
    source: "manual",
    status: "submitted",
    uploadedBy: session.userId,
  });

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "DOC_UPLOAD",
    targetType: "team",
    targetId: teamId,
    detail: { docType, month, fileName, fileId: up.fileId },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, webViewLink: up.webViewLink });
}
