import Link from "next/link";
import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Paperclip } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CAT_COLOR: Record<string, string> = {
  코디전달: "bg-blue-100 text-blue-800 border-blue-200",
  내부공유: "bg-emerald-100 text-emerald-800 border-emerald-200",
  기타: "bg-zinc-100 text-zinc-800 border-zinc-200",
};

export default async function FormsPage() {
  const posts = await db.select().from(schema.formPosts).orderBy(desc(schema.formPosts.createdAt));
  const attachments = await db.select().from(schema.formAttachments);
  const countByPost = new Map<number, number>();
  for (const a of attachments) countByPost.set(a.postId, (countByPost.get(a.postId) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="제출서류 양식"
        description="코디 전달용·내부 공유용 양식 파일을 게시판처럼 올리고 다운로드합니다."
        actions={
          <Link href="/forms/new">
            <Button size="sm"><Plus className="h-4 w-4" /> 새 글</Button>
          </Link>
        }
      />

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 w-32">카테고리</th>
              <th className="p-3">제목</th>
              <th className="p-3 w-32">작성자</th>
              <th className="p-3 w-24 text-center">첨부</th>
              <th className="p-3 w-32">작성일</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">등록된 글이 없습니다. 우측 상단 [새 글] 버튼으로 추가하세요.</td></tr>
            )}
            {posts.map((p) => (
              <tr key={p.id} className="border-t hover:bg-accent/30">
                <td className="p-3">
                  <Badge variant="outline" className={CAT_COLOR[p.category] ?? ""}>{p.category}</Badge>
                </td>
                <td className="p-3">
                  <Link href={`/forms/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                </td>
                <td className="p-3 text-muted-foreground">{p.authorName}</td>
                <td className="p-3 text-center">
                  {(countByPost.get(p.id) ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Paperclip className="h-3 w-3" />{countByPost.get(p.id)}</span>
                  ) : <span className="text-muted-foreground">–</span>}
                </td>
                <td className="p-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
