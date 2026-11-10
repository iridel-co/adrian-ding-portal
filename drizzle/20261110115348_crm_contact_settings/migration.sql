CREATE TABLE "crm_contact_settings" (
	"id" text PRIMARY KEY DEFAULT 'main',
	"corporate_phone" text NOT NULL,
	"corporate_reply_to" text NOT NULL,
	"registration_reply_to" text NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contact_settings_singleton" CHECK ("id" = 'main')
);
--> statement-breakpoint
ALTER TABLE "crm_contact_settings" ADD CONSTRAINT "crm_contact_settings_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "crm_contact_settings" ADD CONSTRAINT "crm_contact_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;