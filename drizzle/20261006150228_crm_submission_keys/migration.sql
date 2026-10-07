CREATE TABLE "crm_submission_key" (
	"key" uuid PRIMARY KEY,
	"payload_hash" text NOT NULL,
	"registration_id" uuid,
	"corporate_inquiry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_submission_key_one_owner" CHECK (("registration_id" IS NOT NULL) <> ("corporate_inquiry_id" IS NOT NULL)),
	CONSTRAINT "crm_submission_key_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "crm_submission_key_registration_idx" ON "crm_submission_key" ("registration_id");--> statement-breakpoint
CREATE INDEX "crm_submission_key_inquiry_idx" ON "crm_submission_key" ("corporate_inquiry_id");--> statement-breakpoint
ALTER TABLE "crm_submission_key" ADD CONSTRAINT "crm_submission_key_registration_id_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registration"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "crm_submission_key" ADD CONSTRAINT "crm_submission_key_wrz8RcBufAzd_fkey" FOREIGN KEY ("corporate_inquiry_id") REFERENCES "corporate_inquiry"("id") ON DELETE RESTRICT;