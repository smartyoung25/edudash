CREATE TABLE `progress_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`progress_percent` integer NOT NULL,
	`snapshot_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_snapshot_team_week_uq` ON `progress_snapshots` (`team_id`,`week_start`);
