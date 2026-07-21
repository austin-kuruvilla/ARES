CREATE TABLE `arc_action_attempts` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`action_id` text NOT NULL,
	`status` text DEFAULT 'applying' NOT NULL,
	`lease_expires_at` text NOT NULL,
	`result_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `arc_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `arc_action_attempts_run_status_idx` ON `arc_action_attempts` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `arc_action_attempts_lease_idx` ON `arc_action_attempts` (`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `arc_runs` ADD `action_state` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `arc_runs` ADD `selected_action_id` text;--> statement-breakpoint
ALTER TABLE `arc_runs` ADD `selected_idempotency_key` text;--> statement-breakpoint
ALTER TABLE `arc_runs` ADD `action_lease_expires_at` text;--> statement-breakpoint
ALTER TABLE `arc_runs` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `arc_runs`
SET `action_state` = 'applied',
	`selected_action_id` = (
		SELECT `action_id` FROM `arc_actions`
		WHERE `arc_actions`.`run_id` = `arc_runs`.`run_id`
			AND `arc_actions`.`status` = 'applied'
		ORDER BY `applied_at` DESC, `action_id` ASC
		LIMIT 1
	),
	`selected_idempotency_key` = (
		SELECT `idempotency_key` FROM `arc_actions`
		WHERE `arc_actions`.`run_id` = `arc_runs`.`run_id`
			AND `arc_actions`.`status` = 'applied'
		ORDER BY `applied_at` DESC, `action_id` ASC
		LIMIT 1
	),
	`action_lease_expires_at` = NULL,
	`revision` = 1
WHERE EXISTS (
	SELECT 1 FROM `arc_actions`
	WHERE `arc_actions`.`run_id` = `arc_runs`.`run_id`
		AND `arc_actions`.`status` = 'applied'
);--> statement-breakpoint
INSERT INTO `arc_action_attempts`
	(`idempotency_key`, `run_id`, `action_id`, `status`, `lease_expires_at`,
	 `result_json`, `created_at`, `updated_at`)
SELECT `arc_actions`.`idempotency_key`, `arc_actions`.`run_id`,
	`arc_actions`.`action_id`, 'applied',
	COALESCE(`arc_actions`.`applied_at`, `arc_runs`.`updated_at`),
	`arc_actions`.`result_json`, `arc_actions`.`created_at`,
	COALESCE(`arc_actions`.`applied_at`, `arc_runs`.`updated_at`)
FROM `arc_actions`
JOIN `arc_runs` ON `arc_runs`.`run_id` = `arc_actions`.`run_id`
	AND `arc_runs`.`selected_action_id` = `arc_actions`.`action_id`
WHERE `arc_actions`.`status` = 'applied'
	AND `arc_actions`.`idempotency_key` IS NOT NULL
ON CONFLICT(`idempotency_key`) DO NOTHING;
