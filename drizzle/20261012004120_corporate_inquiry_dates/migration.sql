ALTER TABLE "corporate_inquiry" ADD COLUMN "target_date_from" date;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD COLUMN "target_date_to" date;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ALTER COLUMN "target_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "corporate_inquiry" ADD CONSTRAINT "corporate_inquiry_target_dates_consistent" CHECK (
    ("target_date_from" IS NOT NULL AND "target_date" IS NULL
      AND ("target_date_to" IS NULL OR "target_date_to" >= "target_date_from"))
    OR ("target_date_from" IS NULL AND "target_date_to" IS NULL
      AND "target_date" IS NOT NULL AND btrim("target_date") <> '')
  );