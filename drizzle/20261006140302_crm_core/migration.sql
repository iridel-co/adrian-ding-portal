CREATE TYPE "crm_email_kind" AS ENUM('payment_instructions', 'corporate_acknowledgment', 'corporate_notification');--> statement-breakpoint
CREATE TYPE "crm_email_state" AS ENUM('pending', 'sending', 'sent', 'failed', 'skipped', 'needs_reconciliation');--> statement-breakpoint
CREATE TYPE "registration_payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
CREATE TABLE "corporate_inquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"idempotency_key" uuid NOT NULL UNIQUE,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"program" text NOT NULL,
	"attendees" text NOT NULL,
	"target_date" text NOT NULL,
	"venue" text NOT NULL,
	"context" text,
	"also_interested" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "corporate_inquiry_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
	CONSTRAINT "corporate_inquiry_payload_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "corporate_inquiry_programs_array" CHECK (jsonb_typeof("also_interested") = 'array')
);
--> statement-breakpoint
CREATE TABLE "crm_email_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"registration_id" uuid,
	"corporate_inquiry_id" uuid,
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
	CONSTRAINT "crm_email_job_owner_kind" CHECK (
    ("kind" = 'payment_instructions' AND "registration_id" IS NOT NULL AND "corporate_inquiry_id" IS NULL)
    OR ("kind" IN ('corporate_acknowledgment', 'corporate_notification')
      AND "corporate_inquiry_id" IS NOT NULL AND "registration_id" IS NULL)
  ),
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
CREATE TABLE "registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"idempotency_key" uuid NOT NULL UNIQUE,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workshop_session_id" uuid NOT NULL,
	"occupation" text NOT NULL,
	"salary_range" text NOT NULL,
	"city" text,
	"price_centavos" integer NOT NULL,
	"payment_status" "registration_payment_status" DEFAULT 'unpaid'::"registration_payment_status" NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_reason" text,
	CONSTRAINT "registration_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
	CONSTRAINT "registration_payload_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registration_price_non_negative" CHECK ("price_centavos" >= 0),
	CONSTRAINT "registration_cancellation_consistent" CHECK (
    ("cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancellation_reason" IS NULL)
    OR ("cancelled_at" IS NOT NULL AND "payment_status" = 'unpaid'
      AND "cancellation_reason" IS NOT NULL AND btrim("cancellation_reason") <> '')
  )
);
--> statement-breakpoint
CREATE INDEX "corporate_inquiry_created_idx" ON "corporate_inquiry" ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_email_job_registration_kind_idx" ON "crm_email_job" ("registration_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_email_job_inquiry_kind_idx" ON "crm_email_job" ("corporate_inquiry_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_active_email_session_idx" ON "registration" ("workshop_session_id","email") WHERE "cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "registration_session_created_idx" ON "registration" ("workshop_session_id","created_at","id");--> statement-breakpoint
ALTER TABLE "crm_email_job" ADD CONSTRAINT "crm_email_job_registration_id_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registration"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "crm_email_job" ADD CONSTRAINT "crm_email_job_corporate_inquiry_id_corporate_inquiry_id_fkey" FOREIGN KEY ("corporate_inquiry_id") REFERENCES "corporate_inquiry"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_workshop_session_id_workshop_session_id_fkey" FOREIGN KEY ("workshop_session_id") REFERENCES "workshop_session"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE FUNCTION "crm_email_job_preserve_message"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.registration_id, NEW.corporate_inquiry_id, NEW.kind, NEW.payload, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.registration_id, OLD.corporate_inquiry_id, OLD.kind, OLD.payload, OLD.created_at) THEN
    RAISE EXCEPTION 'CRM email identity and payload are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "crm_email_job_message_immutable" BEFORE UPDATE ON "crm_email_job"
FOR EACH ROW EXECUTE FUNCTION "crm_email_job_preserve_message"();
