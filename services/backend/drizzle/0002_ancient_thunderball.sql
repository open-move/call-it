ALTER TABLE "ingest_cursors" ADD COLUMN "event_cursor" text;--> statement-breakpoint
ALTER TABLE "ingest_cursors" DROP COLUMN "checkpoint";