import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { requireRole } from "@/lib/auth";
import { generateWeeklyReport } from "@/lib/reports";

export async function POST(req: Request) {
  const session = await requireRole(["admin"]);
  const { weekStart } = await req.json();
  if (!weekStart) return NextResponse.json({ error: "weekStart 필수" }, { status: 400 });

  const buf = await generateWeeklyReport(weekStart);
  const fileName = `weekly_${weekStart}.xlsx`;

  await db.insert(schema.reportHistory).values({
    weekStart,
    filePath: fileName,
    generatedBy: session.userId,
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}

export async function GET() {
  const history = await db.select().from(schema.reportHistory);
  return NextResponse.json({ history });
}
