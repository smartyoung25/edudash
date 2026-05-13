CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`status` text NOT NULL,
	`absent_reason` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`team_id` integer,
	`affiliation` text,
	`phone` text,
	`email` text,
	`kind` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `daily_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`session_no` integer NOT NULL,
	`report_date` text NOT NULL,
	`subject` text,
	`attended` integer DEFAULT 0 NOT NULL,
	`absent` integer DEFAULT 0 NOT NULL,
	`absent_names` text,
	`absent_reason` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_unique` ON `daily_reports` (`team_id`,`session_no`,`report_date`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer,
	`doc_type` text NOT NULL,
	`month` integer,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`uploaded_by` integer,
	`email_from` text,
	`email_subject` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `expense_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer,
	`team_id` integer NOT NULL,
	`expense_date` text,
	`item` text,
	`amount` real,
	`notes` text,
	`drive_url` text,
	`status` text DEFAULT 'auto' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integration_status` (
	`type` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`last_run_at` text,
	`status` text DEFAULT 'disabled' NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `kpi_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`name` text NOT NULL,
	`target_value` real NOT NULL,
	`unit` text NOT NULL,
	`description` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `kpi_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`kpi_def_id` integer NOT NULL,
	`baseline` real DEFAULT 0 NOT NULL,
	`mid_checkpoints` text DEFAULT '[]' NOT NULL,
	`final_value` real,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kpi_def_id`) REFERENCES `kpi_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mail_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`from_address` text NOT NULL,
	`subject` text,
	`received_at` text NOT NULL,
	`classified_team_id` integer,
	`classified_doc_type` text,
	`processed_status` text DEFAULT 'pending' NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_log_message_id_unique` ON `mail_log` (`message_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`name` text NOT NULL,
	`gender` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `report_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`file_path` text NOT NULL,
	`generated_by` integer,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`session_no` integer NOT NULL,
	`subject` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`product` text NOT NULL,
	`cohort` text NOT NULL,
	`course_name` text NOT NULL,
	`region` text NOT NULL,
	`head_count` integer NOT NULL,
	`total_sessions` integer NOT NULL,
	`end_date` text NOT NULL,
	`professor_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`team_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);