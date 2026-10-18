-- Keep existing registration and verification data while replacing the enum.
ALTER TABLE "registration" DROP CONSTRAINT "registration_verification_consistent";--> statement-breakpoint
ALTER TABLE "registration" DROP CONSTRAINT "registration_cancellation_consistent";--> statement-breakpoint
ALTER TABLE "registration" RENAME COLUMN "payment_status" TO "is_paid";--> statement-breakpoint
ALTER TABLE "registration" ALTER COLUMN "is_paid" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "registration" ALTER COLUMN "is_paid" SET DATA TYPE boolean USING ("is_paid"::text = 'paid');--> statement-breakpoint
ALTER TABLE "registration" ALTER COLUMN "is_paid" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_verification_consistent" CHECK (
    (NOT "is_paid" AND "payment_method" IS NULL AND "paid_amount_centavos" IS NULL
      AND "payer_name" IS NULL AND "provider_transaction_reference" IS NULL
      AND "verified_at" IS NULL AND "verified_by" IS NULL)
    OR ("payment_method" IS NOT NULL AND "paid_amount_centavos" IS NOT NULL
      AND "payer_name" IS NOT NULL AND btrim("payer_name") <> ''
      AND "provider_transaction_reference" IS NOT NULL AND btrim("provider_transaction_reference") <> ''
      AND "verified_at" IS NOT NULL AND "verified_by" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_cancellation_consistent" CHECK (
    ("cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancellation_reason" IS NULL)
    OR ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL AND NOT "is_paid"
      AND "cancellation_reason" IS NOT NULL AND btrim("cancellation_reason") <> '')
  );--> statement-breakpoint
-- Preserve old/new audit meaning and all other history fields. Invalid legacy
-- values fail the migration rather than silently changing their meaning.
UPDATE "activity_log"
SET "changes" = ("changes" - 'paymentStatus') || jsonb_build_object(
  'isPaid', ("changes" -> 'paymentStatus') || jsonb_build_object(
    'from', ("changes" -> 'paymentStatus' ->> 'from')::registration_payment_status = 'paid',
    'to', ("changes" -> 'paymentStatus' ->> 'to')::registration_payment_status = 'paid'
  )
)
WHERE "entity_type" = 'registration' AND "changes" ? 'paymentStatus';--> statement-breakpoint
DROP TYPE "registration_payment_status";
