import { NextResponse } from "next/server";
import { importReceiptsFromMail } from "@/lib/integrations/imap-receipts";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300; // 5분

export async function POST(req: Request) {
  await requireAuth();
  const body = await req.json().catch(() => ({}));
  const result = await importReceiptsFromMail({
    fromEmail: body.fromEmail || undefined,
    sinceDays: body.sinceDays || 90,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
