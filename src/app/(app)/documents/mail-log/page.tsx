import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  classified: "분류완료",
  unclassified: "미분류",
  error: "오류",
  pending: "대기",
};
function statusVariant(s: string): "success" | "warning" | "destructive" | "muted" {
  if (s === "classified") return "success";
  if (s === "unclassified") return "warning";
  if (s === "error") return "destructive";
  return "muted";
}

export default async function MailLogPage() {
  await requireRole(["admin"]);

  const [logs, teams, statusRows] = await Promise.all([
    db.select().from(schema.mailLog).orderBy(desc(schema.mailLog.receivedAt)).limit(300),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams),
    db.select().from(schema.integrationStatus).where(eq(schema.integrationStatus.type, "mail")),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const mailStatus = statusRows[0];

  const total = logs.length;
  const classified = logs.filter((l) => l.processedStatus === "classified").length;
  const unclassified = logs.filter((l) => l.processedStatus === "unclassified").length;

  return (
    <div>
      <PageHeader
        title="메일 수집 로그"
        description="이메일에서 자동 수집된 서류 메일 내역입니다 (최근 300건)."
        actions={
          <Link href="/documents"><Button size="sm" variant="outline"><ArrowLeft className="h-4 w-4" /> 서류제출</Button></Link>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <div className="text-muted-foreground">
              마지막 자동 실행: <b className="text-foreground">{mailStatus?.lastRunAt ? formatDate(mailStatus.lastRunAt) : "—"}</b>
              {mailStatus?.message ? ` · ${mailStatus.message}` : ""}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="muted">전체 {total}</Badge>
              <Badge variant="success">분류완료 {classified}</Badge>
              <Badge variant="warning">미분류 {unclassified}</Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">자동 수집: 매일 09·21시(KST) · 최근 14일 메일을 읽음 여부와 무관하게 수집(중복 자동 제외)</div>
        </Card>

        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 w-40">수신일시</th>
                <th className="p-3 w-56">발신자</th>
                <th className="p-3">제목</th>
                <th className="p-3 w-32">분류 팀</th>
                <th className="p-3 w-24 text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">아직 수집된 메일이 없습니다.</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-t hover:bg-accent/30">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(l.receivedAt)}</td>
                  <td className="p-3 text-muted-foreground truncate max-w-[220px]" title={l.fromAddress}>{l.fromAddress}</td>
                  <td className="p-3 truncate max-w-[360px]" title={l.subject ?? ""}>{l.subject || <span className="text-muted-foreground">(제목 없음)</span>}</td>
                  <td className="p-3">{l.classifiedTeamId ? (teamName.get(l.classifiedTeamId) ?? `#${l.classifiedTeamId}`) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3 text-center">
                    <Badge variant={statusVariant(l.processedStatus)}>{STATUS_LABEL[l.processedStatus] ?? l.processedStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
