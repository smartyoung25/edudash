import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { getDriveFileMeta } from "@/lib/integrations/drive";
import { z } from "zod";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(20000).optional().default(""),
  category: z.enum(["코디전달", "내부공유", "기타"]),
  attachments: z
    .array(
      z.object({
        fileId: z.string().min(1),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

export async function GET() {
  await requireAuth();
  const posts = await db.select().from(schema.formPosts).orderBy(desc(schema.formPosts.createdAt));
  const attachments = await db.select().from(schema.formAttachments);
  const countByPost = new Map<number, number>();
  for (const a of attachments) countByPost.set(a.postId, (countByPost.get(a.postId) ?? 0) + 1);
  return NextResponse.json(
    posts.map((p) => ({ ...p, attachmentCount: countByPost.get(p.id) ?? 0 })),
  );
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const now = new Date().toISOString();
  const inserted = await db
    .insert(schema.formPosts)
    .values({
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
      authorId: session.userId ?? null,
      authorName: session.name ?? "익명",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.formPosts.id });
  const postId = inserted[0].id;

  for (const a of parsed.data.attachments) {
    const meta = await getDriveFileMeta(a.fileId);
    await db.insert(schema.formAttachments).values({
      postId,
      fileName: a.fileName,
      mimeType: a.mimeType ?? null,
      driveFileId: a.fileId,
      driveUrl: meta?.webViewLink ?? `https://drive.google.com/file/d/${a.fileId}/view`,
      sizeBytes: a.sizeBytes ?? null,
    });
  }

  return NextResponse.json({ ok: true, id: postId });
}
