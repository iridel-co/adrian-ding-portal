ALTER TABLE "payment_account" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_account_one_active_idx" ON "payment_account" USING btree ("is_active") WHERE "is_active" = true;
