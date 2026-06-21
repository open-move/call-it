ALTER TABLE "ingest_cursors" ADD COLUMN "checkpoint" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_cursors" DROP COLUMN "event_cursor";