import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { canUploadDocument } from "@/lib/permissions";
import { getDriveFileMeta } from "@/lib/integrations/drive";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const Schema = z.object({
  teamId: z.number().int().positive(),
  docType: z.enum(["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지", "미분류"]),
  month: z.number().int().min(1).max(12),
  fileId: z.string().min(1).max(200),
  fileName: z.string().min(1).max(255),
});

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const ip = getClientIp(req);

  if (!canUploadDocument(session.role!)) {
    return NextResponse.json({ error: "서류 업로드 권한이 없습니다" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { teamId, docType, month, fileId, fileName } = parsed.data;

  // 파일이 실제로 Drive에 존재하는지 확인 (위조된 fileId 차단)
  const meta = await getDriveFileMeta(fileId);
  if (!meta) {
    return NextResponse.json({ error: "Drive에서 파일을 찾을 수 없습니다" }, { status: 404 });
  }

  await db.insert(schema.documents).values({
    teamId,
    docType: docType as "출석부" | "코디일지" | "경비영수증" | "강사비지급확인서" | "교육생일지" | "미분류",
    month,
    fileName,
    filePath: meta.webViewLink ?? fileId,
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
    detail: { docType, month, fileName, fileId },
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true, webViewLink: meta.webViewLink });
}
