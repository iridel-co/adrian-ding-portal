ALTER TABLE "site_profile" ADD COLUMN "tagline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_profile" ADD COLUMN "roles" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_profile" ADD COLUMN "footer_topics" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_profile" ADD COLUMN "corporate_primer_video_url" text;--> statement-breakpoint
ALTER TABLE "site_profile" ADD COLUMN "corporate_primer_blurb" text DEFAULT '' NOT NULL;