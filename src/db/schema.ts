import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ───────── 사용자 / 권한 ─────────

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "coordinator", "professor"] }).notNull(),
  teamId: integer("team_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ───────── 팀 / 교육생 ─────────

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  product: text("product", { enum: ["감귤", "딸기", "배", "토마토", "포도", "한우"] }).notNull(),
  cohort: text("cohort").notNull(),
  courseName: text("course_name").notNull(),
  region: text("region").notNull(),
  headCount: integer("head_count").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  endDate: text("end_date").notNull(),
  professorName: text("professor_name").notNull(),
  professorPhone: text("professor_phone"),
  professorEmail: text("professor_email"),
  coordinatorName: text("coordinator_name"),
  coordinatorPhone: text("coordinator_phone"),
  coordinatorEmail: text("coordinator_email"),
});

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gender: text("gender", { enum: ["M", "F"] }),
  learnerType: text("learner_type"), // 청년농 | 농업인
  birthDate: text("birth_date"),     // YYYY-MM-DD
  phone: text("phone"),              // 010-XXXX-XXXX
  email: text("email"),              // user@example.com
  eduStatus: text("edu_status"),     // 교육중 | 교육취소
});

// ───────── 차시 / 출석 ─────────

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  sessionNo: integer("session_no").notNull(),
  subject: text("subject").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  status: text("status", { enum: ["planned", "in-progress", "done"] }).notNull().default("planned"),
});

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["present", "absent"] }).notNull(),
  absentReason: text("absent_reason"),
});

export const dailyReports = sqliteTable(
  "daily_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    sessionNo: integer("session_no").notNull(),
    reportDate: text("report_date").notNull(),
    subject: text("subject"),
    attended: integer("attended").notNull().default(0),
    absent: integer("absent").notNull().default(0),
    absentNames: text("absent_names"),
    absentReason: text("absent_reason"),
    notes: text("notes"),
    source: text("source", { enum: ["sheet", "manual"] }).notNull().default("manual"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    uniqByTeamSessionDate: uniqueIndex("daily_unique").on(t.teamId, t.sessionNo, t.reportDate),
  }),
);

// ───────── KPI ─────────

export const kpiDefinitions = sqliteTable("kpi_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetValue: real("target_value").notNull(),
  unit: text("unit").notNull(),
  description: text("description"),
});

export const kpiProgress = sqliteTable("kpi_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  kpiDefId: integer("kpi_def_id").notNull().references(() => kpiDefinitions.id, { onDelete: "cascade" }),
  baseline: real("baseline").default(0).notNull(),
  // mid_checkpoints stored as JSON: [{round:1, value:30, date:"2026-04-01"}, ...]
  midCheckpoints: text("mid_checkpoints").default("[]").notNull(),
  finalValue: real("final_value"),
});

// ───────── 서류 / 영수증 ─────────

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
  docType: text("doc_type", {
    enum: ["출석부", "코디일지", "경비영수증", "강사비지급확인서", "교육생일지", "미분류"],
  }).notNull(),
  month: integer("month"), // 1~12, null이면 미상
  sessionNo: integer("session_no"), // 차시 번호. 분류 시 자동 추론 또는 수동 지정
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  source: text("source", { enum: ["mail", "manual"] }).notNull(),
  status: text("status", { enum: ["submitted", "missing"] }).notNull().default("submitted"),
  receivedAt: text("received_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  uploadedBy: integer("uploaded_by"),
  emailFrom: text("email_from"),
  emailSubject: text("email_subject"),
});

export const expenseReceipts = sqliteTable("expense_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  expenseDate: text("expense_date"),
  item: text("item"),
  amount: real("amount"),
  notes: text("notes"),
  driveUrl: text("drive_url"),
  status: text("status", { enum: ["auto", "confirmed", "rejected"] }).notNull().default("auto"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 팀 별칭 — 메일 본문/제목에 "한우해움" 같이 들어와도 팀7 한우7기로 매칭되게
export const teamAliases = sqliteTable("team_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  alias: text("alias").notNull().unique(),
});

// ───────── 팀별 정산 — 카테고리 예산 ─────────

export const expenseBudgets = sqliteTable("expense_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  category: text("category", { enum: ["주임강사수당", "퍼실리테이터수당", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] }).notNull(),
  amount: integer("amount").notNull().default(0),
}, (t) => ({
  uq: uniqueIndex("expense_budgets_team_cat_uq").on(t.teamId, t.category),
}));

// ───────── 팀별 정산 (지출) ─────────

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
  sessionNo: integer("session_no"), // 회차 번호 (sessionId 없을 때도 입력 가능)
  spentDate: text("spent_date").notNull(),  // YYYY-MM-DD
  category: text("category", { enum: ["주임강사수당", "퍼실리테이터수당", "식대", "다과", "재료비", "숙박", "임차비", "출장비", "기타"] }).notNull(),
  supplyAmount: integer("supply_amount").notNull().default(0),  // 공급가액
  vatAmount: integer("vat_amount").notNull().default(0),        // 부가세액
  totalAmount: integer("total_amount").notNull().default(0),    // 집행액 = 공급가 + 부가세
  vendorType: text("vendor_type", { enum: ["개인사업자", "법인사업자"] }),
  vendorBizNo: text("vendor_biz_no"),       // 사업자등록번호
  vendorName: text("vendor_name"),          // 거래처명
  vendorCeo: text("vendor_ceo"),            // 대표자명
  cardType: text("card_type", { enum: ["기업카드", "기업법인카드", "NH법인카드", "개인카드"] }),
  cardLast4: text("card_last4"),            // 카드번호 끝 4자리
  payerName: text("payer_name"),            // 개인카드인 경우 결제한 사람
  reimburseStatus: text("reimburse_status", { enum: ["미정산", "정산완료"] }).default("미정산"),
  reimbursedAt: text("reimbursed_at"),
  reimburseNote: text("reimburse_note"),
  memo: text("memo"),
  docType: text("doc_type", { enum: ["영수증", "거래명세표", "세금계산서"] }).default("영수증"),
  source: text("source", { enum: ["manual", "mail"] }).notNull().default("manual"),
  mailMessageId: text("mail_message_id"),         // IMAP UID 또는 Message-ID 중복방지
  mailFrom: text("mail_from"),
  mailReceivedAt: text("mail_received_at"),
  attachmentName: text("attachment_name"),
  receiptFilePath: text("receipt_file_path"),   // data/receipts/... 로컬 경로
  receiptMimeType: text("receipt_mime_type"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ───────── 기관경비 (팀과 무관한 본사 경비) ─────────

export const agencyExpenses = sqliteTable("agency_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["출장비", "기타경비"] }).notNull(),
  // 출장비 세부 분류 — 한 출장이 여러 영수증으로 쪼개진다
  subcategory: text("subcategory", { enum: ["일비", "식비", "교통비", "숙박비", "다과비", "택시비", "기타"] }),
  tripName: text("trip_name"),    // 같은 출장을 그룹핑하는 이름
  spentDate: text("spent_date").notNull(),
  supplyAmount: integer("supply_amount").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  vendorType: text("vendor_type", { enum: ["개인사업자", "법인사업자"] }),
  vendorBizNo: text("vendor_biz_no"),
  vendorName: text("vendor_name"),
  vendorCeo: text("vendor_ceo"),
  cardType: text("card_type", { enum: ["기업카드", "기업법인카드", "NH법인카드", "개인카드"] }),
  cardLast4: text("card_last4"),
  payerName: text("payer_name"),
  reimburseStatus: text("reimburse_status", { enum: ["미정산", "정산완료"] }).default("미정산"),
  reimbursedAt: text("reimbursed_at"),
  reimburseNote: text("reimburse_note"),
  memo: text("memo"),
  docType: text("doc_type", { enum: ["영수증", "거래명세표", "세금계산서"] }).default("영수증"),
  receiptFilePath: text("receipt_file_path"),
  receiptMimeType: text("receipt_mime_type"),
  dedupKey: text("dedup_key"), // 노션 등 외부 import dedup용 (사용자 비노출)
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ───────── 연락망 ─────────

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
  affiliation: text("affiliation"),
  phone: text("phone"),
  email: text("email"),
  kind: text("kind", { enum: ["professor", "internal"] }).notNull(),
});

// ───────── 시스템 / 로그 ─────────

export const integrationStatus = sqliteTable("integration_status", {
  type: text("type", { enum: ["sheets", "mail", "drive", "ocr"] }).primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  lastRunAt: text("last_run_at"),
  status: text("status", { enum: ["idle", "running", "ok", "error", "disabled"] })
    .notNull()
    .default("disabled"),
  message: text("message"),
});

export const mailLog = sqliteTable("mail_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull().unique(),
  fromAddress: text("from_address").notNull(),
  subject: text("subject"),
  receivedAt: text("received_at").notNull(),
  classifiedTeamId: integer("classified_team_id"),
  classifiedDocType: text("classified_doc_type"),
  processedStatus: text("processed_status", { enum: ["pending", "classified", "unclassified", "error"] })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
});

export const reportHistory = sqliteTable("report_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekStart: text("week_start").notNull(),
  filePath: text("file_path").notNull(),
  generatedBy: integer("generated_by"),
  generatedAt: text("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ───────── 로그인 시도 (브루트포스 방어, Vercel 다중 인스턴스 대응) ─────────

export const loginAttempts = sqliteTable("login_attempts", {
  // key = `${ip}:${emailLower}` 또는 `email:${emailLower}` (IP 무관 카운터)
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0), // epoch ms
  lastAttemptAt: integer("last_attempt_at").notNull().default(0),
});

// ───────── 보안 감사 로그 ─────────

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(), // LOGIN_SUCCESS | LOGIN_FAIL | LOGIN_LOCKED |
                                     // KPI_UPDATE | DAILY_CREATE | DAILY_UPDATE |
                                     // DOC_UPLOAD | DOC_RESOLVE | REPORT_GENERATE
  targetType: text("target_type"),   // "member" | "team" | "document" | "session"
  targetId: integer("target_id"),
  detail: text("detail"),            // JSON 상세 (변경 전후 값 등)
  ipAddress: text("ip_address"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type DailyReport = typeof dailyReports.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type KpiDef = typeof kpiDefinitions.$inferSelect;
export type KpiProgress = typeof kpiProgress.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
