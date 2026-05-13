import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ───────── 사용자 / 권한 ─────────

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "coordinator", "professor", "funder"] }).notNull(),
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
});

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gender: text("gender", { enum: ["M", "F"] }),
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

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type DailyReport = typeof dailyReports.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type KpiDef = typeof kpiDefinitions.$inferSelect;
export type KpiProgress = typeof kpiProgress.$inferSelect;
