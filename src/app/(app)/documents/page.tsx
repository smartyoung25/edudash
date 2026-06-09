import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { AlertTriangle, Mail, ChevronRight } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { UploadButton } from "./upload-button";
import { MailSyncButton } from "./mail-sync-button";
import { BackfillButton } from "./backfill-button";
import { ResolveDialog } from "./resolve-dialog";
import { getCurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/permissions";
import { canResolveUnclassified, canUploadDocument } from "@/lib/permissions";

const DOC_TYPES = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"] as const;

export const dynamic = "force-dynamic";

// 파일명에서 N차시 패턴 추출 (DB session_no가 비어 있을 때 폴백)
function extractSessionNo(fileName: string): number | null {
  const m = fileName.match(/(\d{1,2})\s*차시/);
  return m ? parseInt(m[1], 10) : null;
}

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const role = (user?.role ?? "professor") as Role;

  const [teams, allDocs, allSessions, statusRows] = await Promise.all([
    db.select().from(schema.teams),
    db.select().from(schema.documents),
    db.select().from(schema.sessions),
    db.select().from(schema.integrationStatus).where(eq(schema.integrationStatus.type, "mail")),
  ]);
  const mailStatus = statusRows[0];
  const unclassified = allDocs.filter((d) => d.docType === "미분류");

  // 팀별 차시 수
  const sessionCountByTeam = new Map<number, number>();
  for (const s of allSessions) {
    sessionCountByTeam.set(s.teamId, (sessionCountByTeam.get(s.teamId) ?? 0) + 1);
  }

  // 팀별로 서류 유형별로 "제출된 차시 set" 계산
  // 차시 결정: session_no 컬럼 → 파일명 패턴 → (둘 다 없으면 카운트 제외, 월별로만 표시되는 정산성 문서)
  function submittedSessions(teamId: number, docType: string): Set<number> {
    const set = new Set<number>();
    for (const d of allDocs) {
      if (d.teamId !== teamId || d.docType !== docType) continue;
      const no = d.sessionNo ?? extractSessionNo(d.fileName);
      if (no) set.add(no);
    }
    return set;
  }

  // 팀별로 차시와 무관한(월별) 정산 문서가 몇 건 있는지
  function monthlyDocs(teamId: number, docType: string): number {
    return allDocs.filter((d) => {
      if (d.teamId !== teamId || d.docType !== docType) return false;
      const no = d.sessionNo ?? extractSessionNo(d.fileName);
      return !no;
    }).length;
  }

  return (
    <div>
      <PageHeader
        title="서류제출"
        description="메일 자동 수집 및 수동 업로드 서류를 팀별·차시별로 집계합니다"
        actions={
          <div className="flex items-center gap-2">
            {canUploadDocument(role) && <UploadButton teams={teams} />}
            {role === "admin" && <BackfillButton />}
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
            <div className="flex items-center gap-2">
              <Badge variant={mailStatus?.status === "ok" ? "success" : mailStatus?.status === "error" ? "destructive" : "muted"}>
                {mailStatus?.status === "ok" ? "정상" :
                 mailStatus?.status === "error" ? "오류" :
                 mailStatus?.status === "running" ? "실행중" : "비활성"}
              </Badge>
              {role === "admin" && (
                <Link href="/documents/mail-log">
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent">수집 로그 보기</Badge>
                </Link>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 ml-8">자동 수집: 매일 09·21시(KST) · 최근 14일 메일을 읽음 여부와 무관하게 수집(중복 자동 제외)</div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">팀별 차시 단위 서류 제출률</h2>
          <p className="text-sm text-muted-foreground mb-4">
            각 셀: 해당 서류가 제출된 <b>차시 수 / 전체 차시 수</b> · 파일명에 차시가 없는 월별 정산 문서는 별도 표기. 셀 클릭 시 팀 상세 페이지로 이동.
          </p>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 sticky top-0">
                  <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/40 z-10 min-w-[160px]">팀</th>
                  {DOC_TYPES.map((dt) => (
                    <th key={dt} className="text-center p-3 font-medium text-muted-foreground min-w-[140px]">{dt}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const total = sessionCountByTeam.get(t.id) ?? 0;
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 sticky left-0 bg-background align-top">
                        <Link href={`/teams/${t.id}/documents`} className="block group">
                          <div className="font-medium group-hover:text-emerald-600 flex items-center gap-1">
                            {t.name}
                            <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          </div>
                          <div className="text-[11px] text-muted-foreground">{t.cohort} · 총 {total}차시</div>
                        </Link>
                      </td>
                      {DOC_TYPES.map((dt) => {
                        const set = submittedSessions(t.id, dt);
                        const submittedCount = set.size;
                        const monthly = monthlyDocs(t.id, dt);
                        const pct = total === 0 ? 0 : Math.round((submittedCount / total) * 100);
                        const empty = submittedCount === 0 && monthly === 0;
                        return (
                          <td key={dt} className="p-3 align-top">
                            <Link href={`/teams/${t.id}/documents`} className="block">
                              {empty ? (
                                <div className="text-center text-xs text-rose-400">미제출</div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-baseline justify-between gap-1">
                                    <span
                                      className={cn(
                                        "text-sm font-semibold",
                                        pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-foreground",
                                      )}
                                    >
                                      {submittedCount}
                                      <span className="text-xs font-normal text-muted-foreground">/{total}</span>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{pct}%</span>
                                  </div>
                                  <Progress value={pct} className="h-1.5" />
                                  {monthly > 0 && (
                                    <div className="text-[10px] text-amber-600">+ 월별 {monthly}건</div>
                                  )}
                                </div>
                              )}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <div>· 차시 매칭: <code className="text-[11px]">documents.session_no</code> 또는 파일명의 <code className="text-[11px]">N차시</code> 패턴</div>
            <div>· "월별 N건": 차시 정보 없이 월 단위로만 분류된 정산성 문서(경비·강사비 등)</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
