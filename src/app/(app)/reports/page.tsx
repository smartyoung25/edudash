import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { GenerateForm } from "./generate-form";
import { getCurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  const role = (user?.role ?? "funder") as Role;
  const history = await db.select().from(schema.reportHistory).orderBy(desc(schema.reportHistory.generatedAt)).limit(20);
  const thisMonday = getMonday(new Date()).toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="주간보고"
        description="발주기관(농정원) 제출용 운영현황 엑셀을 자동 생성합니다"
      />
      <div className="p-6 space-y-6">
        {role === "admin" && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">주간 보고서 생성</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              주차 시작일을 선택하면 4시트 구성의 .xlsx 파일이 자동 생성·다운로드됩니다.
              (시트1: 기수별 운영현황, 시트2: 교육생별 운영현황, 시트3: 질의사항, 시트4: 연락망)
            </p>
            <GenerateForm defaultWeekStart={thisMonday} />
          </Card>
        )}

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">생성 이력</h2>
          {history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">아직 생성된 보고서가 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium text-muted-foreground">주차 시작일</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">생성 일시</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">파일 경로</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">상태</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="p-2 font-mono">{h.weekStart}</td>
                    <td className="p-2">{formatDate(h.generatedAt)}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{h.filePath}</td>
                    <td className="p-2"><Badge variant="success">생성완료</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
