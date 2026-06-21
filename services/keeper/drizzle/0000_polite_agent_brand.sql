CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oracles` (
	`expiry` text NOT NULL,
	`last_checkpoint` integer NOT NULL,
	`oracle_id` text PRIMARY KEY NOT NULL,
	`settlement_price` text NOT NULL,
	`settled_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`cost` text NOT NULL,
	`expiry` text NOT NULL,
	`is_up` integer NOT NULL,
	`key` text PRIMARY KEY NOT NULL,
	`last_checkpoint` integer NOT NULL,
	`manager_id` text NOT NULL,
	`minted_qty` text NOT NULL,
	`open_qty` text NOT NULL,
	`oracle_id` text NOT NULL,
	`owner` text NOT NULL,
	`payout` text NOT NULL,
	`quote_asset` text NOT NULL,
	`redeemed_qty` text NOT NULL,
	`settled` integer NOT NULL,
	`settlement_price` text,
	`strike` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `positions_manager_idx` ON `positions` (`manager_id`);--> statement-breakpoint
CREATE INDEX `positions_oracle_idx` ON `positions` (`oracle_id`);--> statement-breakpoint
CREATE INDEX `positions_open_idx` ON `positions` (`open_qty`);--> statement-breakpoint
CREATE TABLE `raw_events` (
	`checkpoint` integer NOT NULL,
	`event_index` integer NOT NULL,
	`event_type` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`inserted_at` integer NOT NULL,
	`json` text NOT NULL,
	`module` text NOT NULL,
	`package_id` text NOT NULL,
	`reconciled_at` integer,
	`sender` text NOT NULL,
	`transaction_digest` text NOT NULL,
	`transaction_index` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_events_checkpoint_idx` ON `raw_events` (`checkpoint`);--> statement-breakpoint
CREATE INDEX `raw_events_reconciled_idx` ON `raw_events` (`reconciled_at`);--> statement-breakpoint
CREATE TABLE `txs` (
	`created_at` integer NOT NULL,
	`digest` text PRIMARY KEY NOT NULL,
	`error` text,
	`expected_payout` text NOT NULL,
	`manager_id` text NOT NULL,
	`oracle_id` text NOT NULL,
	`position_key` text NOT NULL,
	`quantity` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `txs_position_idx` ON `txs` (`position_key`);--> statement-breakpoint
CREATE INDEX `txs_status_idx` ON `txs` (`status`);