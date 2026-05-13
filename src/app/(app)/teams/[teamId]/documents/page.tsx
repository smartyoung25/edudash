import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, FileText, Mail, Upload } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

const DOC_TYPES = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"] as const;
const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export default async function DocsTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);
  const docs = await db.select().from(schema.documents).where(eq(schema.documents.teamId, tid));

  function find(docType: string, month: number) {
    return docs.find((d) => d.docType === docType && d.month === month);
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-1">서류 제출 현황</h2>
      <p className="text-sm text-muted-foreground mb-4">메일 자동 수집 또는 수동 업로드된 5종 서류를 월별로 표시</p>
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">서류 유형</th>
              {MONTHS.map((m) => (
                <th key={m} className="p-3 text-sm font-medium text-muted-foreground text-center">{m}월</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOC_TYPES.map((dt) => (
              <tr key={dt} className="border-b last:border-0">
                <td className="p-3 font-medium text-sm">{dt}</td>
                {MONTHS.map((m) => {
                  const doc = find(dt, m);
                  return (
                    <td key={m} className="p-3 text-center">
                      {doc ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <Check className="h-4 w-4 text-emerald-500" />
                            {doc.source === "mail" ? (
                              <Mail className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Upload className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={doc.fileName}>
                            {formatDate(doc.receivedAt)}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <X className="h-4 w-4 text-rose-500" />
                          <span className="text-[10px] text-rose-500">미제출</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> 메일 자동 수집</span>
        <span className="flex items-center gap-1"><Upload className="h-3 w-3" /> 수동 업로드</span>
      </div>
    </Card>
  );
}
