CREATE TYPE "registration_payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
ALTER TYPE "crm_email_kind" ADD VALUE 'payment_instructions';--> statement-breakpoint
ALTER TYPE "crm_email_kind" ADD VALUE 'payment_acknowledgment';--> statement-breakpoint
CREATE TABLE "registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"idempotency_key" uuid NOT NULL UNIQUE,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workshop_session_id" uuid NOT NULL,
	"reference" text NOT NULL UNIQUE,
	"occupation" text NOT NULL,
	"salary_range" text NOT NULL,
	"city" text,
	"consent_at" timestamp with time zone NOT NULL,
	"price_centavos" integer NOT NULL,
	"payment_status" "registration_payment_status" DEFAULT 'unpaid'::"registration_payment_status" NOT NULL,
	"payment_method" "payment_method",
	"paid_amount_centavos" integer,
	"payer_name" text,
	"provider_transaction_reference" text,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_reason" text,
	CONSTRAINT "registration_reference_format" CHECK ("reference" ~ '^AD-[A-Z0-9]{2,8}-[0-9]{4,}$'),
	CONSTRAINT "registration_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
	CONSTRAINT "registration_payload_hash_sha256" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registration_price_non_negative" CHECK ("price_centavos" >= 0),
	CONSTRAINT "registration_paid_amount_non_negative" CHECK ("paid_amount_centavos" >= 0),
	CONSTRAINT "registration_verification_consistent" CHECK (
    ("payment_status" = 'unpaid' AND "payment_method" IS NULL AND "paid_amount_centavos" IS NULL
      AND "payer_name" IS NULL AND "provider_transaction_reference" IS NULL
      AND "verified_at" IS NULL AND "verified_by" IS NULL)
    OR ("payment_method" IS NOT NULL AND "paid_amount_centavos" IS NOT NULL
      AND "payer_name" IS NOT NULL AND btrim("payer_name") <> ''
      AND "provider_transaction_reference" IS NOT NULL AND btrim("provider_transaction_reference") <> ''
      AND "verified_at" IS NOT NULL AND "verified_by" IS NOT NULL)
  ),
	CONSTRAINT "registration_cancellation_consistent" CHECK (
    ("cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancellation_reason" IS NULL)
    OR ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL AND "payment_status" = 'unpaid'
      AND "cancellation_reason" IS NOT NULL AND btrim("cancellation_reason") <> '')
  )
);
--> statement-breakpoint
CREATE TABLE "registration_reference_counter" (
	"course_code" text PRIMARY KEY,
	"last_number" integer NOT NULL,
	CONSTRAINT "registration_reference_counter_code_format" CHECK ("course_code" ~ '^[A-Z0-9]{2,8}$'),
	CONSTRAINT "registration_reference_counter_positive" CHECK ("last_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "crm_email_job" ADD COLUMN "registration_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_submission_key" ADD COLUMN "registration_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_email_job" ALTER COLUMN "corporate_inquiry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_submission_key" ALTER COLUMN "corporate_inquiry_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_email_job_registration_kind_idx" ON "crm_email_job" ("registration_id","kind");--> statement-breakpoint
CREATE INDEX "crm_submission_key_registration_idx" ON "crm_submission_key" ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_active_email_session_idx" ON "registration" ("workshop_session_id","email") WHERE "cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "registration_session_created_idx" ON "registration" ("workshop_session_id","created_at","id");--> statement-breakpoint
ALTER TABLE "crm_email_job" ADD CONSTRAINT "crm_email_job_registration_id_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registration"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "crm_submission_key" ADD CONSTRAINT "crm_submission_key_registration_id_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registration"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_workshop_session_id_workshop_session_id_fkey" FOREIGN KEY ("workshop_session_id") REFERENCES "workshop_session"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_verified_by_user_id_fkey" FOREIGN KEY ("verified_by") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "crm_email_job" ADD CONSTRAINT "crm_email_job_owner_kind" CHECK (
    ("registration_id" IS NOT NULL AND "corporate_inquiry_id" IS NULL
      AND "kind"::text IN ('payment_instructions', 'payment_acknowledgment'))
    OR ("corporate_inquiry_id" IS NOT NULL AND "registration_id" IS NULL
      AND "kind"::text IN ('corporate_acknowledgment', 'corporate_notification', 'corporate_overdue'))
  );--> statement-breakpoint
ALTER TABLE "crm_submission_key" ADD CONSTRAINT "crm_submission_key_one_owner" CHECK (("corporate_inquiry_id" IS NOT NULL) <> ("registration_id" IS NOT NULL));--> statement-breakpoint
-- Issued payment references must survive staff corrections unchanged.
CREATE FUNCTION "preserve_registration_reference"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference IS DISTINCT FROM OLD.reference THEN
    RAISE EXCEPTION 'Registration references are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "registration_reference_immutable" BEFORE UPDATE OF "reference" ON "registration"
  FOR EACH ROW EXECUTE FUNCTION "preserve_registration_reference"();
