import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { uploadDocumentToDrive } from "@/lib/integrations/drive";
import { isDriveEnabled } from "@/lib/env";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED = [".pdf", ".hwp", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"];

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export async function POST(req: Request) {
  const session = await requireAuth();
  if (!isDriveEnabled()) {
    return NextResponse.json(
      { error: "Drive 자격증명 미설정 (GOOGLE_SERVICE_ACCOUNT_JSON / DRIVE_ROOT_FOLDER_ID)" },
      { status: 503 },
    );
  }

  const fd = await req.formData();
  const teamId = Number(fd.get("teamId"));
  const docType = String(fd.get("docType"));
  const month = Number(fd.get("month"));
  const file = fd.get("file") as File | null;

  if (!file || !teamId || !docType || !month) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "파일이 20MB를 초과합니다" }, { status: 400 });
  }
  const e = ext(file.name);
  if (!ALLOWED.includes(e)) {
    return NextResponse.json({ error: `허용되지 않는 형식: ${e}` }, { status: 400 });
  }

  const teamRow = await db.select({ name: schema.teams.name })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  if (teamRow.length === 0) {
    return NextResponse.json({ error: "팀을 찾을 수 없습니다" }, { status: 404 });
  }

  const bytes = await file.arrayBuffer();
  const upload = await uploadDocumentToDrive({
    teamName: teamRow[0].name,
    docType,
    month,
    fileName: file.name,
    bytes,
  });
  if (!upload.ok) {
    return NextResponse.json({ error: upload.message }, { status: 500 });
  }

  await db.insert(schema.documents).values({
    teamId,
    docType: docType as "출석부" | "코디일지" | "경비영수증" | "강사비지급확인서" | "교육생일지",
    month,
    fileName: file.name,
    filePath: upload.webViewLink ?? upload.fileId ?? "",
    source: "manual",
    status: "submitted",
    uploadedBy: session.userId,
  });

  return NextResponse.json({ ok: true, webViewLink: upload.webViewLink });
}
