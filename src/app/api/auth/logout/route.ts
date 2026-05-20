import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(req);

  await writeAuditLog({
    userId: session.userId,
    userEmail: session.email,
    action: "LOGOUT",
    ipAddress: ip,
  });

  session.destroy();
  return NextResponse.json({ ok: true });
}
