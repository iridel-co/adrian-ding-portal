ALTER TYPE "crm_email_kind" ADD VALUE 'corporate_overdue';--> statement-breakpoint
CREATE INDEX "crm_email_job_corporate_recovery_idx" ON "crm_email_job" ("updated_at","id") WHERE "corporate_inquiry_id" IS NOT NULL AND "state" IN ('pending', 'failed', 'sending');--> statement-breakpoint
ALTER TABLE "crm_email_job" DROP CONSTRAINT "crm_email_job_owner_kind", ADD CONSTRAINT "crm_email_job_owner_kind" CHECK (
    ("kind" = 'payment_instructions' AND "registration_id" IS NOT NULL AND "corporate_inquiry_id" IS NULL)
    OR ("kind"::text IN ('corporate_acknowledgment', 'corporate_notification', 'corporate_overdue')
      AND "corporate_inquiry_id" IS NOT NULL AND "registration_id" IS NULL)
  );