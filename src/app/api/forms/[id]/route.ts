import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

async function getPostOrNull(id: number) {
  const rows = await db.select().from(schema.formPosts).where(eq(schema.formPosts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const post = await getPostOrNull(numId);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  const atts = await db.select().from(schema.formAttachments).where(eq(schema.formAttachments.postId, numId));
  return NextResponse.json({ ...post, attachments: atts });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const numId = Number(id);
  const post = await getPostOrNull(numId);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.authorId !== session.userId && session.role !== "admin") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  await db.delete(schema.formPosts).where(eq(schema.formPosts.id, numId));
  return NextResponse.json({ ok: true });
}
