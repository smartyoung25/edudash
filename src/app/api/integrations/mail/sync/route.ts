import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pollMailbox, updateMailStatus } from "@/lib/integrations/imap";

// Vercel Cron 또는 admin 사용자만 호출 가능
async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1) Vercel Cron: Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  // 2) admin 세션 (수동 트리거)
  try {
    await requireRole(["admin"]);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await pollMailbox();
  await updateMailStatus(result);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// Vercel Cron 은 GET 으로 호출됨
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await pollMailbox();
  await updateMailStatus(result);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
