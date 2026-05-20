import { db, schema } from "@/db/client";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAIL"
  | "LOGIN_LOCKED"
  | "LOGOUT"
  | "KPI_UPDATE"
  | "DAILY_CREATE"
  | "DAILY_UPDATE"
  | "DOC_UPLOAD"
  | "DOC_RESOLVE"
  | "REPORT_GENERATE"
  | "SHEETS_SYNC"
  | "MAIL_SYNC";

interface AuditParams {
  userId?: number | null;
  userEmail?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: number;
  detail?: Record<string, unknown> | string;
  ipAddress?: string;
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      detail: params.detail
        ? typeof params.detail === "string"
          ? params.detail
          : JSON.stringify(params.detail)
        : null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch {
    // 감사 로그 실패가 메인 로직을 막지 않도록 silent fail
    console.error("[AUDIT] 로그 기록 실패:", params.action);
  }
}

/** Next.js Request에서 클라이언트 IP 추출 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
