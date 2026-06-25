CREATE TABLE "strategy_fold_state" (
	"last_round" integer,
	"strategy_id" text PRIMARY KEY NOT NULL,
	"supply" text NOT NULL,
	"updated_checkpoint" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_perf_snapshot" (
	"checkpoint" bigint NOT NULL,
	"event_seq" integer NOT NULL,
	"kind" text NOT NULL,
	"nav" text NOT NULL,
	"share_price" double precision NOT NULL,
	"strategy_id" text NOT NULL,
	"timestamp_ms" bigint NOT NULL,
	"total_shares" text NOT NULL,
	"tx_digest" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "strategy_perf_strategy_timestamp_idx" ON "strategy_perf_snapshot" USING btree ("strategy_id","timestamp_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_perf_tx_event_unique" ON "strategy_perf_snapshot" USING btree ("tx_digest","event_seq");