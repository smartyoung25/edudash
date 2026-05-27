import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { checkAndSendProgressAlerts } from "@/lib/integrations/progress-alert";

export async function POST() {
  await requireRole(["admin"]);
  try {
    const r = await checkAndSendProgressAlerts();
    return NextResponse.json(r);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
