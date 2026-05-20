import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { AlertTriangle, Mail, Upload, Check, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { UploadButton } from "./upload-button";
import { MailSyncButton } from "./mail-sync-button";
import { ResolveDialog } from "./resolve-dialog";
import { getCurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/permissions";
import { canResolveUnclassified, canUploadDocument } from "@/lib/permissions";

const DOC_TYPES = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"] as const;
const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const role = (user?.role ?? "professor") as Role;
  const teams = await db.select().from(schema.teams);
  const docs = await db.select().from(schema.documents);
  const status = await db.select().from(schema.integrationStatus).where(eq(schema.integrationStatus.type, "mail"));
  const mailStatus = status[0];
  const unclassified = docs.filter((d) => d.docType === "미분류");

  function find(teamId: number, docType: string, month: number) {
    return docs.find((d) => d.teamId === teamId && d.docType === docType && d.month === month);
  }

  return (
    <div>
      <PageHeader
        title="서류제출"
        description="메일 자동 수집 및 수동 업로드 서류를 팀×월 단위로 관리합니다"
        actions={
          <div className="flex items-center gap-2">
            {canUploadDocument(role) && <UploadButton teams={teams} />}
            {role === "admin" && <MailSyncButton />}
          </div>
        }
      />
      <div className="p-6 space-y-6">
        {unclassified.length > 0 && (
          <Card className="p-4 border-amber-300 bg-amber-50">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <div className="text-sm font-medium text-amber-900">미분류 서류 {unclassified.length}건</div>
                <div className="text-xs text-amber-700">발신자/제목 자동 매칭에 실패한 서류입니다. 수동 분류가 필요합니다.</div>
              </div>
              {canResolveUnclassified(role) && <ResolveDialog teams={teams} unclassified={unclassified} />}
            </div>
          </Card>
        )}

        <Card className="p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">메일 자동 수집 (stepup2@iiam.co.kr)</div>
                <div className="text-xs text-muted-foreground">
                  마지막 실행: {mailStatus?.lastRunAt ? formatDate(mailStatus.lastRunAt) : "—"} · {mailStatus?.message ?? "비활성"}
                </div>
              </div>
            </div>
            <Badge variant={mailStatus?.status === "ok" ? "success" : mailStatus?.status === "error" ? "destructive" : "muted"}>
              {mailStatus?.status === "ok" ? "정상" :
               mailStatus?.status === "error" ? "오류" :
               mailStatus?.status === "running" ? "실행중" : "비활성"}
            </Badge>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">팀 × 월별 서류 현황</h2>
          <p className="text-sm text-muted-foreground mb-4">5종 서류 제출/미제출 한눈에 보기</p>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b sticky top-0 bg-background">
                  <th className="text-left p-2 font-medium text-muted-foreground sticky left-0 bg-background z-10">팀</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">서류</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="text-center p-2 font-medium text-muted-foreground min-w-[60px]">{m}월</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t) =>
                  DOC_TYPES.map((dt, idx) => (
                    <tr key={`${t.id}-${dt}`} className="border-b last:border-0">
                      {idx === 0 && (
                        <td rowSpan={DOC_TYPES.length} className="p-2 align-top sticky left-0 bg-background border-r">
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.cohort}</div>
                        </td>
                      )}
                      <td className="p-2 text-xs text-muted-foreground">{dt}</td>
                      {MONTHS.map((m) => {
                        const doc = find(t.id, dt, m);
                        return (
                          <td key={m} className="p-2 text-center">
                            {doc ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                {doc.source === "mail" ? <Mail className="h-2.5 w-2.5 text-muted-foreground" /> : <Upload className="h-2.5 w-2.5 text-muted-foreground" />}
                              </span>
                            ) : (
                              <X className="h-3.5 w-3.5 text-rose-400 inline" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
