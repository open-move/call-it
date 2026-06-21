CREATE TABLE "arena_activity" (
	"actor" text NOT NULL,
	"call_id" text NOT NULL,
	"call_label" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"timestamp_ms" text NOT NULL,
	CONSTRAINT "arena_activity_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "arena_bond_claimed_events" (
	"bond_plp_amount" text NOT NULL,
	"call_id" text NOT NULL,
	"checkpoint" bigint NOT NULL,
	"claimed_at_ms" text NOT NULL,
	"digest" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"event_index" integer NOT NULL,
	"oracle_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_bond_reclaimed_events" (
	"bond_plp_amount" text NOT NULL,
	"call_id" text NOT NULL,
	"checkpoint" bigint NOT NULL,
	"digest" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"event_index" integer NOT NULL,
	"reclaimed_at_ms" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_call_backed_events" (
	"call_id" text NOT NULL,
	"checkpoint" bigint NOT NULL,
	"cost" text NOT NULL,
	"digest" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"event_index" integer NOT NULL,
	"manager_id" text NOT NULL,
	"participant" text NOT NULL,
	"quantity" text NOT NULL,
	"recorded_at_ms" text NOT NULL,
	"refund_amount" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_call_faded_events" (
	"call_id" text NOT NULL,
	"checkpoint" bigint NOT NULL,
	"cost" text NOT NULL,
	"digest" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"event_index" integer NOT NULL,
	"manager_id" text NOT NULL,
	"participant" text NOT NULL,
	"quantity" text NOT NULL,
	"recorded_at_ms" text NOT NULL,
	"refund_amount" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_call_launched_events" (
	"arena_id" text NOT NULL,
	"bond_plp_amount" text NOT NULL,
	"call_id" text NOT NULL,
	"checkpoint" bigint NOT NULL,
	"created_at_ms" text NOT NULL,
	"creator" text NOT NULL,
	"digest" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"event_index" integer NOT NULL,
	"expiry" text NOT NULL,
	"is_up" boolean NOT NULL,
	"oracle_id" text NOT NULL,
	"predict_id" text NOT NULL,
	"strike" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_calls" (
	"backers" integer DEFAULT 0 NOT NULL,
	"bond_plp_amount" text NOT NULL,
	"bond_claimed" boolean DEFAULT false NOT NULL,
	"call_id" text NOT NULL,
	"created_at_ms" text NOT NULL,
	"creator" text NOT NULL,
	"expiry" text NOT NULL,
	"faders" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"is_up" boolean NOT NULL,
	"oracle_id" text NOT NULL,
	"predict_id" text NOT NULL,
	"strike" text NOT NULL,
	CONSTRAINT "arena_calls_call_id_unique" UNIQUE("call_id")
);
--> statement-breakpoint
CREATE TABLE "arena_creators" (
	"address" text NOT NULL,
	"bonded_plp" text DEFAULT '0' NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "arena_creators_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "arena_participations" (
	"call_id" text NOT NULL,
	"cost" text NOT NULL,
	"event_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"participant" text NOT NULL,
	"quantity" text NOT NULL,
	"recorded_at_ms" text NOT NULL,
	"side" text NOT NULL,
	CONSTRAINT "arena_participations_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "ingest_cursors" (
	"checkpoint" bigint NOT NULL,
	"pipeline" text PRIMARY KEY NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"content_json" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" bigint NOT NULL,
	"hash" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"checkpoint" bigint NOT NULL,
	"checkpoint_timestamp_ms" bigint NOT NULL,
	"contents" text,
	"digest" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"event_index" integer NOT NULL,
	"event_type" text NOT NULL,
	"inserted_at" bigint NOT NULL,
	"json" text,
	"module" text NOT NULL,
	"package_id" text NOT NULL,
	"sender" text NOT NULL,
	"tx_index" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "arena_activity_call_idx" ON "arena_activity" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "arena_calls_creator_idx" ON "arena_calls" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "arena_participations_call_idx" ON "arena_participations" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "arena_participations_participant_idx" ON "arena_participations" USING btree ("participant");--> statement-breakpoint
CREATE INDEX "raw_events_checkpoint_idx" ON "raw_events" USING btree ("checkpoint");--> statement-breakpoint
CREATE INDEX "raw_events_package_idx" ON "raw_events" USING btree ("package_id");