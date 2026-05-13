import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED = [".pdf", ".hwp", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"];

export async function POST(req: Request) {
  const session = await requireAuth();
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
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return NextResponse.json({ error: `허용되지 않는 형식: ${ext}` }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", "uploads", String(teamId), String(month));
  await fs.mkdir(dir, { recursive: true });
  const safeName = `${Date.now()}_${file.name.replace(/[^\w가-힣.\-]/g, "_")}`;
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  await db.insert(schema.documents).values({
    teamId,
    docType: docType as "출석부" | "코디일지" | "경비영수증" | "강사비지급확인서" | "교육생일지",
    month,
    fileName: file.name,
    filePath: filePath.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, ""),
    source: "manual",
    status: "submitted",
    uploadedBy: session.userId,
  });

  return NextResponse.json({ ok: true });
}
