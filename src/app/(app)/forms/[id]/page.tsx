import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Paperclip } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { DeleteButton } from "./delete-button";

export const dynamic = "force-dynamic";

const CAT_COLOR: Record<string, string> = {
  코디전달: "bg-blue-100 text-blue-800 border-blue-200",
  내부공유: "bg-emerald-100 text-emerald-800 border-emerald-200",
  기타: "bg-zinc-100 text-zinc-800 border-zinc-200",
};

export default async function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [postRows, attachments, user] = await Promise.all([
    db.select().from(schema.formPosts).where(eq(schema.formPosts.id, numId)).limit(1),
    db.select().from(schema.formAttachments).where(eq(schema.formAttachments.postId, numId)),
    getCurrentUser(),
  ]);
  const post = postRows[0];
  if (!post) notFound();

  const canDelete = user && (user.role === "admin" || user.id === post.authorId);

  return (
    <div className="space-y-4">
      <Link href="/forms" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 목록
      </Link>
      <PageHeader
        title={post.title}
        description={`${post.authorName} · ${formatDate(post.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={CAT_COLOR[post.category] ?? ""}>{post.category}</Badge>
            {canDelete && <DeleteButton id={post.id} />}
          </div>
        }
      />

      {post.body && (
        <Card className="p-5">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> 첨부파일 ({attachments.length})
        </h3>
        {attachments.length === 0 ? (
          <div className="text-sm text-muted-foreground">첨부파일이 없습니다.</div>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span className="truncate">{a.fileName}{a.sizeBytes ? ` (${Math.round(a.sizeBytes / 1024)} KB)` : ""}</span>
                <a href={a.driveUrl ?? `https://drive.google.com/file/d/${a.driveFileId}/view`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline"><Download className="h-4 w-4" /> 열기</Button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
