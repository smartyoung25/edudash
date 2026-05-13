import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { pollMailbox, updateMailStatus } from "@/lib/integrations/imap";

export async function POST() {
  await requireRole(["admin"]);
  const result = await pollMailbox();
  await updateMailStatus(result);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
