CREATE TYPE "corporate_inquiry_status" AS ENUM('NEW', 'CONTACTED', 'PROPOSAL_SENT', 'WON', 'LOST', 'SPAM');--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "status" "corporate_inquiry_status" DEFAULT 'NEW'::"corporate_inquiry_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "sla_due_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "proposal_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "estimated_value_centavos" integer;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "lost_reason" text;--> statement-breakpoint
CREATE INDEX "corporate_inquiry_status_created_idx" ON "corporate_inquiry" ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "corporate_inquiry_overdue_idx" ON "corporate_inquiry" ("sla_due_at","id") WHERE "status" = 'NEW';--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD CONSTRAINT "corporate_inquiry_value_non_negative" CHECK ("estimated_value_centavos" >= 0);--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD CONSTRAINT "corporate_inquiry_deadline_after_creation" CHECK ("sla_due_at" > "created_at");--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD CONSTRAINT "corporate_inquiry_lifecycle_consistent" CHECK (
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
  );