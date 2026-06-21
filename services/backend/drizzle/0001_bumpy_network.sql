CREATE TABLE "users" (
	"avatar_url" text,
	"created_at" bigint NOT NULL,
	"display_name" text,
	"dynamic_user_id" text NOT NULL,
	"email" text,
	"id" text PRIMARY KEY NOT NULL,
	"updated_at" bigint NOT NULL,
	"username" text,
	CONSTRAINT "users_dynamic_user_id_unique" UNIQUE("dynamic_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" text NOT NULL,
	"chain" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"linked_at" bigint NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");