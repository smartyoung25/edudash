import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { isJangseongStrawberry } from "@/lib/integrations/self-mail-rule";

// 미분류 서류 중 stepup2(메일함 본인) 발신이면서 딸기11기(장성) 무관인 항목 일괄 삭제.
// (과거 잘못 수집된 자기발신/나간 메일 첨부 정리용 — 운영 DB는 화면 버튼으로 트리거)
export async function POST() {
  await requireRole(["admin"]);
  const self = (env.GMAIL_USER ?? "").toLowerCase();
  if (!self) return NextResponse.json({ error: "GMAIL_USER 미설정" }, { status: 400 });

  const rows = await db.select().from(schema.documents).where(eq(schema.documents.docType, "미분류"));
  const targets = rows.filter(
    (d) =>
      (d.emailFrom ?? "").toLowerCase() === self &&
      !isJangseongStrawberry(d.emailSubject, d.fileName),
  );

  if (targets.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  const ids = targets.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 200) {
    await db.delete(schema.documents).where(inArray(schema.documents.id, ids.slice(i, i + 200)));
  }

  return NextResponse.json({
    ok: true,
    deleted: ids.length,
    samples: targets.slice(0, 10).map((d) => ({ subject: d.emailSubject, file: d.fileName })),
  });
}
