CREATE TABLE `card_statements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tx_date` text NOT NULL,
	`vendor_name` text,
	`amount` integer NOT NULL,
	`card_last4` text,
	`card_type` text,
	`approval_no` text,
	`raw_row` text,
	`upload_batch` text,
	`matched_expense_id` integer,
	`matched_agency_expense_id` integer,
	`match_confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_stmt_dedup_uq` ON `card_statements` (`tx_date`,`card_last4`,`amount`,`approval_no`);
