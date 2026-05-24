import { NextResponse } from "next/server";
import { importTravelReceiptsFromNotion } from "@/lib/integrations/notion";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  await requireAuth();
  const body = await req.json().catch(() => ({}));
  const result = await importTravelReceiptsFromNotion({ since: body.since });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
