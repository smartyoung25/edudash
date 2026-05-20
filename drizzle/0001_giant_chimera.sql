CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`user_email` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` integer,
	`detail` text,
	`ip_address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `learner_type` text;--> statement-breakpoint
ALTER TABLE `members` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `members` ADD `edu_status` text;