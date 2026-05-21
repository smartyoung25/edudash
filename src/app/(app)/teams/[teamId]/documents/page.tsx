import { db, schema } from "@/db/client";
import { eq, asc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Mail, Upload, ExternalLink, FileText } from "lucide-react";
import { formatMonthDay } from "@/lib/utils";

const DOC_TYPES = ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지"] as const;

// 파일명에서 "N차시" 패턴 추출 (예: "출석부_2차시.pdf" → 2)
function extractSessionNo(fileName: string): number | null {
  const m = fileName.match(/(\d{1,2})\s*차시/);
  return m ? parseInt(m[1], 10) : null;
}

function driveUrl(filePath: string): string | null {
  // file_path 가 Drive fileId (recent commit 이후)
  if (!filePath || filePath.startsWith("local/") || filePath.includes("/")) return null;
  return `https://drive.google.com/file/d/${filePath}/view`;
}

export default async function DocsTab({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const tid = Number(teamId);

  const [sessions, docs] = await Promise.all([
    db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.teamId, tid))
      .orderBy(asc(schema.sessions.sessionNo)),
    db.select().from(schema.documents).where(eq(schema.documents.teamId, tid)),
  ]);

  // 차시별로 서류 매칭
  // 1순위: 파일명에 N차시 명시된 경우 (정확 매칭)
  // 2순위: 그 외 (월별 매칭) — 같은 월의 모든 차시에 표시
  type DocRow = typeof docs[number];
  const byType = new Map<string, DocRow[]>();
  for (const dt of DOC_TYPES) byType.set(dt, []);
  for (const d of docs) {
    if (byType.has(d.docType)) byType.get(d.docType)!.push(d);
  }

  function docSessionNo(d: DocRow): number | null {
    return d.sessionNo ?? extractSessionNo(d.fileName);
  }

  function findDocs(docType: string, session: typeof sessions[number]): DocRow[] {
    const all = byType.get(docType) ?? [];
    const sessionMonth = parseInt(session.scheduledDate.slice(5, 7), 10);
    // 정확 매칭: session_no 컬럼(자동 추론 결과) 또는 파일명 패턴
    const exact = all.filter((d) => docSessionNo(d) === session.sessionNo);
    if (exact.length > 0) return exact;
    // 월별 fallback — 어떤 차시에든 정확 매칭된 docs는 제외
    const matchedIds = new Set(all.filter((d) => docSessionNo(d) !== null).map((d) => d.id));
    return all.filter((d) => !matchedIds.has(d.id) && d.month === sessionMonth);
  }

  if (sessions.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-2">서류 제출 현황</h2>
        <p className="text-sm text-muted-foreground">교육 일정이 없어 차시별 표를 만들 수 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-1">서류 제출 현황</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Google Drive 업로드 + 메일 자동 수집 결과를 차시별로 표시합니다. 파일명에 <code className="text-xs">N차시</code> 가 포함되면 해당 차시에 정확 매칭되고, 없으면 같은 월의 차시 전체에 표시됩니다.
      </p>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-2 sticky left-0 bg-muted/30 font-medium text-muted-foreground min-w-[80px]">차시</th>
              <th className="text-left p-2 sticky left-[80px] bg-muted/30 font-medium text-muted-foreground min-w-[180px]">주제</th>
              {DOC_TYPES.map((dt) => (
                <th key={dt} className="p-2 text-center font-medium text-muted-foreground min-w-[140px]">{dt}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="p-2 sticky left-0 bg-background align-top">
                  <div className="flex flex-col">
                    <Badge variant="outline" className="font-mono w-fit">{s.sessionNo}차시</Badge>
                    <span className="text-[11px] text-muted-foreground mt-1">{formatMonthDay(s.scheduledDate)}</span>
                  </div>
                </td>
                <td className="p-2 sticky left-[80px] bg-background align-top text-xs max-w-[180px]">{s.subject}</td>
                {DOC_TYPES.map((dt) => {
                  const matched = findDocs(dt, s);
                  if (matched.length === 0) {
                    return (
                      <td key={dt} className="p-2 text-center align-top">
                        <div className="flex flex-col items-center gap-1">
                          <X className="h-4 w-4 text-rose-400" />
                          <span className="text-[10px] text-rose-400">미제출</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={dt} className="p-2 align-top">
                      <div className="space-y-1.5">
                        {matched.map((d) => {
                          const url = driveUrl(d.filePath);
                          const exact = docSessionNo(d) === s.sessionNo;
                          const content = (
                            <div className="flex items-start gap-1.5 text-[11px]">
                              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="truncate" title={d.fileName}>{d.fileName}</div>
                                <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                                  {d.source === "mail" ? <Mail className="h-2.5 w-2.5" /> : <Upload className="h-2.5 w-2.5" />}
                                  <span>{d.source === "mail" ? "메일" : "수동"}</span>
                                  {!exact && <span className="text-amber-600">· {d.month}월 (차시 미상)</span>}
                                  {url && <ExternalLink className="h-2.5 w-2.5 ml-auto" />}
                                </div>
                              </div>
                            </div>
                          );
                          return url ? (
                            <a key={d.id} href={url} target="_blank" rel="noopener noreferrer" className="block hover:bg-muted/40 rounded p-1 -m-1">
                              {content}
                            </a>
                          ) : (
                            <div key={d.id} className="p-1 -m-1">{content}</div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> 메일 자동 수집 (stepup2@iiam.co.kr)</span>
        <span className="flex items-center gap-1"><Upload className="h-3 w-3" /> 수동 업로드</span>
        <span className="flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Drive 원본 열기</span>
        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 총 {docs.length}개 파일</span>
      </div>
    </Card>
  );
}
