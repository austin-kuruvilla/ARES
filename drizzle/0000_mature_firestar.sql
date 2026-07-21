CREATE TABLE `arc_actions` (
	`run_id` text NOT NULL,
	`action_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`action_json` text NOT NULL,
	`result_json` text,
	`idempotency_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `arc_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arc_actions_run_action_uidx` ON `arc_actions` (`run_id`,`action_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `arc_actions_idempotency_uidx` ON `arc_actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `arc_actions_run_status_idx` ON `arc_actions` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `arc_audit_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`event_type` text NOT NULL,
	`actor` text DEFAULT 'arc-demo' NOT NULL,
	`idempotency_key` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arc_audit_events_idempotency_uidx` ON `arc_audit_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `arc_audit_events_run_created_idx` ON `arc_audit_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `arc_audit_events_type_idx` ON `arc_audit_events` (`event_type`);--> statement-breakpoint
CREATE TABLE `arc_memory` (
	`memory_id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`scenario_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `arc_runs`(`run_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `arc_memory_scenario_created_idx` ON `arc_memory` (`scenario_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `arc_memory_run_idx` ON `arc_memory` (`run_id`);--> statement-breakpoint
CREATE INDEX `arc_memory_kind_idx` ON `arc_memory` (`kind`);--> statement-breakpoint
CREATE TABLE `arc_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`question` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`bundle_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arc_runs_scenario_created_idx` ON `arc_runs` (`scenario_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `arc_runs_status_idx` ON `arc_runs` (`status`);