import { db, schema } from "@/db/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { CheckCircle2, XCircle, AlertCircle, FileSpreadsheet, HardDrive, Mail, ScanText } from "lucide-react";
import { isSheetsEnabled, isDriveEnabled, isMailEnabled, isOcrEnabled } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole(["admin"]);
  const status = await db.select().from(schema.integrationStatus);
  const get = (k: string) => status.find((s) => s.type === k);

  const items = [
    {
      type: "sheets",
      label: "Google Sheets (일일현황 읽기)",
      icon: FileSpreadsheet,
      enabled: isSheetsEnabled(),
      env: ["GOOGLE_SERVICE_ACCOUNT_JSON_PATH", "DAILY_SHEETS_SPREADSHEET_ID", "GOOGLE_DELEGATED_USER"],
      desc: "코디네이터가 입력한 구글 스프레드시트의 새 행을 5분 간격으로 읽어옵니다.",
    },
    {
      type: "drive",
      label: "Google Drive (영수증 업로드)",
      icon: HardDrive,
      enabled: isDriveEnabled(),
      env: ["GOOGLE_SERVICE_ACCOUNT_JSON_PATH", "DRIVE_ROOT_FOLDER_ID"],
      desc: "경비영수증 원본 파일을 구글 드라이브 [팀]/경비영수증/[월] 폴더에 업로드합니다.",
    },
    {
      type: "mail",
      label: "IMAP 메일 자동 수집",
      icon: Mail,
      enabled: isMailEnabled(),
      env: ["IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD"],
      desc: "stepup2@iiam.co.kr 메일함의 새 메일에서 첨부파일을 추출하고 팀별·서류유형별로 분류합니다.",
    },
    {
      type: "ocr",
      label: "OCR (영수증 파싱)",
      icon: ScanText,
      enabled: isOcrEnabled(),
      env: ["GOOGLE_VISION_KEY_PATH"],
      desc: "Google Cloud Vision API로 영수증의 금액·일자·항목을 자동 추출합니다. (선택)",
    },
  ];

  return (
    <div>
      <PageHeader title="연동 설정" description="외부 시스템 연동 상태 및 자격증명 안내" />
      <div className="p-6 space-y-4">
        <Card className="p-5 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <div className="font-medium">자격증명은 .env.local 파일에서 설정합니다</div>
              <div>코드는 모든 연동을 지원하며, 자격증명이 채워지면 즉시 활성화됩니다. .env.example 파일을 .env.local로 복사 후 편집하세요. 발급 방법은 README를 참고하세요.</div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const s = get(item.type);
            const Icon = item.icon;
            const isOk = item.enabled;
            return (
              <Card key={item.type} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={isOk ? "h-10 w-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center" : "h-10 w-10 rounded-lg bg-muted text-muted-foreground flex items-center justify-center"}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                  <Badge variant={isOk ? "success" : "muted"} className="shrink-0">
                    {isOk ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {isOk ? "활성" : "비활성"}
                  </Badge>
                </div>
                <div className="space-y-1.5 mt-3 pt-3 border-t">
                  <div className="text-xs text-muted-foreground">필요 환경변수</div>
                  <ul className="text-xs font-mono space-y-0.5">
                    {item.env.map((k) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className={process.env[k] ? "text-emerald-600" : "text-rose-500"}>
                          {process.env[k] ? "✓" : "✗"}
                        </span>
                        <span>{k}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-0.5">
                  <div>마지막 실행: {s?.lastRunAt ? formatDate(s.lastRunAt) : "—"}</div>
                  <div>상태 메시지: {s?.message ?? "—"}</div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
