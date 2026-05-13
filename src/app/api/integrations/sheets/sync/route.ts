import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDailyReports, updateSheetsStatus } from "@/lib/integrations/sheets";

export async function POST() {
  await requireRole(["admin"]);
  const result = await readDailyReports();
  await updateSheetsStatus(result);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
