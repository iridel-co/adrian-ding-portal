CREATE TYPE "corporate_inquiry_status" AS ENUM('NEW', 'CONTACTED', 'PROPOSAL_SENT', 'WON', 'LOST', 'SPAM');--> statement-breakpoint
CREATE TYPE "crm_email_kind" AS ENUM('corporate_acknowledgment', 'corporate_notification', 'corporate_overdue');--> statement-breakpoint
CREATE TYPE "crm_email_state" AS ENUM('pending', 'sending', 'sent', 'failed', 'skipped', 'needs_reconciliation');--> statement-breakpoint
CREATE TABLE "corporate_inquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"idempotency_key" uuid NOT NULL UNIQUE,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"program" text NOT NULL,
	"attendees" text NOT NULL,
	"target_date_from" date,
	"target_date_to" date,
	"target_date" text,
	"venue" text NOT NULL,
	"context" text,
	"also_interested" jsonb DEFAULT '[]' NOT NULL,
	"status" "corporate_inquiry_status" DEFAULT 'NEW'::"corporate_inquiry_status" NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"contacted_at" timestamp with time zone,
	"proposal_sent_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"estimated_value_centavos" integer,
	"lost_reason" text,
	CONSTRAINT "corporate_inquiry_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
	CONSTRAINT "corporate_inquiry_payload_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "corporate_inquiry_programs_array" CHECK (jsonb_typeof("also_interested") = 'array'),
	CONSTRAINT "corporate_inquiry_target_dates_consistent" CHECK (
    ("target_date_from" IS NOT NULL AND "target_date" IS NULL
      AND ("target_date_to" IS NULL OR "target_date_to" >= "target_date_from"))
    OR ("target_date_from" IS NULL AND "target_date_to" IS NULL
      AND "target_date" IS NOT NULL AND btrim("target_date") <> '')
  ),
	CONSTRAINT "corporate_inquiry_value_non_negative" CHECK ("estimated_value_centavos" >= 0),
	CONSTRAINT "corporate_inquiry_deadline_after_creation" CHECK ("sla_due_at" > "created_at"),
	CONSTRAINT "corporate_inquiry_lifecycle_consistent" CHECK (
    ("status" IN ('NEW', 'SPAM') AND "contacted_at" IS NULL AND "proposal_sent_at" IS NULL
      AND "closed_at" IS NULL AND "lost_reason" IS NULL)
    OR ("status" = 'CONTACTED' AND "contacted_at" IS NOT NULL AND "proposal_sent_at" IS NULL
      AND "closed_at" IS NULL AND "lost_reason" IS NULL)
    OR ("status" = 'PROPOSAL_SENT' AND "contacted_at" IS NOT NULL AND "proposal_sent_at" IS NOT NULL
      AND "estimated_value_centavos" IS NOT NULL AND "closed_at" IS NULL AND "lost_reason" IS NULL)
    OR ("status" = 'WON' AND "contacted_at" IS NOT NULL AND "proposal_sent_at" IS NOT NULL
      AND "estimated_value_centavos" IS NOT NULL AND "closed_at" IS NOT NULL AND "lost_reason" IS NULL)
    OR ("status" = 'LOST' AND "closed_at" IS NOT NULL AND "lost_reason" IS NOT NULL
      AND btrim("lost_reason") <> ''
      AND ("proposal_sent_at" IS NULL OR ("contacted_at" IS NOT NULL AND "estimated_value_centavos" IS NOT NULL)))
  )
);
--> statement-breakpoint
CREATE TABLE "crm_email_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"corporate_inquiry_id" uuid NOT NULL,
	"kind" "crm_email_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "crm_email_state" DEFAULT 'pending'::"crm_email_state" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_id" text,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_email_job_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
	CONSTRAINT "crm_email_job_attempts_consistent" CHECK (
    ("attempt_count" = 0 AND "first_attempt_at" IS NULL AND "last_attempt_at" IS NULL)
    OR ("attempt_count" > 0 AND "first_attempt_at" IS NOT NULL
      AND "last_attempt_at" IS NOT NULL AND "last_attempt_at" >= "first_attempt_at")
  ),
	CONSTRAINT "crm_email_job_lease_consistent" CHECK (
    ("state" = 'sending' AND "attempt_count" > 0 AND "lease_expires_at" IS NOT NULL)
    OR ("state" <> 'sending' AND "lease_expires_at" IS NULL)
  ),
	CONSTRAINT "crm_email_job_sent_consistent" CHECK (
    ("state" = 'sent' AND "attempt_count" > 0 AND "sent_at" IS NOT NULL
      AND "provider_id" IS NOT NULL AND btrim("provider_id") <> '')
    OR ("state" <> 'sent' AND "sent_at" IS NULL AND "provider_id" IS NULL)
  ),
	CONSTRAINT "crm_email_job_safe_error_code" CHECK ("last_error_code" ~ '^[a-z][a-z0-9_]{0,63}$')
);
--> statement-breakpoint
CREATE TABLE "crm_submission_key" (
	"key" uuid PRIMARY KEY,
	"payload_hash" text NOT NULL,
	"corporate_inquiry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_submission_key_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "corporate_inquiry_created_idx" ON "corporate_inquiry" ("created_at","id");--> statement-breakpoint
CREATE INDEX "corporate_inquiry_status_created_idx" ON "corporate_inquiry" ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "corporate_inquiry_overdue_idx" ON "corporate_inquiry" ("sla_due_at","id") WHERE "status" = 'NEW';--> statement-breakpoint
CREATE UNIQUE INDEX "crm_email_job_inquiry_kind_idx" ON "crm_email_job" ("corporate_inquiry_id","kind");--> statement-breakpoint
CREATE INDEX "crm_email_job_corporate_recovery_idx" ON "crm_email_job" ("updated_at","id") WHERE "state" IN ('pending', 'failed', 'sending');--> statement-breakpoint
CREATE INDEX "crm_submission_key_inquiry_idx" ON "crm_submission_key" ("corporate_inquiry_id");--> statement-breakpoint
ALTER TABLE "crm_email_job" ADD CONSTRAINT "crm_email_job_corporate_inquiry_id_corporate_inquiry_id_fkey" FOREIGN KEY ("corporate_inquiry_id") REFERENCES "corporate_inquiry"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "crm_submission_key" ADD CONSTRAINT "crm_submission_key_wrz8RcBufAzd_fkey" FOREIGN KEY ("corporate_inquiry_id") REFERENCES "corporate_inquiry"("id") ON DELETE RESTRICT;