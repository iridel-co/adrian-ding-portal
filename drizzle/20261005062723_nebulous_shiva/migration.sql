CREATE TYPE "activity_action" AS ENUM('create', 'update', 'status_change', 'reorder', 'archive', 'restore');--> statement-breakpoint
CREATE TYPE "content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "faq_group" AS ENUM('workshop', 'about');--> statement-breakpoint
CREATE TYPE "payment_method" AS ENUM('bank', 'gcash', 'maya');--> statement-breakpoint
CREATE TYPE "taxonomy_kind" AS ENUM('workshop_tag', 'client_industry');--> statement-breakpoint
CREATE TYPE "session_status" AS ENUM('draft', 'open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text,
	"action" "activity_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group" "faq_group" NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text NOT NULL UNIQUE,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt" text DEFAULT '' NOT NULL,
	"archived_at" timestamp,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"method" "payment_method" NOT NULL,
	"provider_name" text NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"qr_media_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_profile" (
	"id" text PRIMARY KEY DEFAULT 'main',
	"headline" text DEFAULT '' NOT NULL,
	"short_bio" text DEFAULT '' NOT NULL,
	"long_bio" jsonb DEFAULT '[]' NOT NULL,
	"portrait_media_id" uuid,
	"emails" jsonb DEFAULT '[]' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"social_links" jsonb DEFAULT '[]' NOT NULL,
	"stats" jsonb DEFAULT '[]' NOT NULL,
	"timeline" jsonb DEFAULT '[]' NOT NULL,
	"credentials" jsonb DEFAULT '[]' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_profile_singleton" CHECK ("id" = 'main')
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"logo_media_id" uuid,
	"industry_term_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inhouse_program" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"image_media_id" uuid,
	"useful_for" jsonb DEFAULT '[]' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"quote" text DEFAULT '' NOT NULL,
	"person_name" text NOT NULL,
	"photo_media_id" uuid,
	"role" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"workshop_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "taxonomy_kind" NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL UNIQUE,
	"course_code" text UNIQUE,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"problem" text DEFAULT '' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"format" text DEFAULT '' NOT NULL,
	"hero_media_id" uuid,
	"primer_video_url" text,
	"primer_blurb" text DEFAULT '' NOT NULL,
	"default_venue_name" text DEFAULT '' NOT NULL,
	"default_city" text DEFAULT '' NOT NULL,
	"default_venue_map_url" text,
	"default_price_centavos" integer,
	"default_price_note" text DEFAULT '' NOT NULL,
	"default_capacity" integer,
	"outcomes" jsonb DEFAULT '[]' NOT NULL,
	"curriculum" jsonb DEFAULT '[]' NOT NULL,
	"inclusions" jsonb DEFAULT '[]' NOT NULL,
	"what_to_expect" jsonb DEFAULT '[]' NOT NULL,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_course_code_format" CHECK ("course_code" ~ '^[A-Z0-9]{2,8}$')
);
--> statement-breakpoint
CREATE TABLE "workshop_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workshop_id" uuid NOT NULL,
	"date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"venue_name" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"venue_map_url" text,
	"registration_cutoff_at" timestamp with time zone,
	"price_centavos" integer NOT NULL,
	"price_note" text DEFAULT '' NOT NULL,
	"capacity" integer NOT NULL,
	"status" "session_status" DEFAULT 'draft'::"session_status" NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_session_date_order" CHECK ("end_date" >= "date"),
	CONSTRAINT "workshop_session_time_order" CHECK ("end_time" > "start_time"),
	CONSTRAINT "workshop_session_capacity_positive" CHECK ("capacity" >= 1),
	CONSTRAINT "workshop_session_price_non_negative" CHECK ("price_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workshop_tag" (
	"workshop_id" uuid,
	"term_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workshop_tag_pkey" PRIMARY KEY("workshop_id","term_id")
);
--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_log_createdAt_idx" ON "activity_log" ("created_at");--> statement-breakpoint
CREATE INDEX "faq_group_idx" ON "faq" ("group");--> statement-breakpoint
CREATE INDEX "media_createdAt_idx" ON "media" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_term_kind_name_active_idx" ON "taxonomy_term" ("kind",lower("name")) WHERE "archived_at" is null;--> statement-breakpoint
CREATE INDEX "workshop_session_workshopId_idx" ON "workshop_session" ("workshop_id");--> statement-breakpoint
CREATE INDEX "workshop_session_date_idx" ON "workshop_session" ("date");--> statement-breakpoint
CREATE INDEX "workshop_session_endDate_idx" ON "workshop_session" ("end_date");--> statement-breakpoint
CREATE INDEX "workshop_tag_termId_idx" ON "workshop_tag" ("term_id");--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "faq" ADD CONSTRAINT "faq_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "faq" ADD CONSTRAINT "faq_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment_account" ADD CONSTRAINT "payment_account_qr_media_id_media_id_fkey" FOREIGN KEY ("qr_media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment_account" ADD CONSTRAINT "payment_account_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment_account" ADD CONSTRAINT "payment_account_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_profile" ADD CONSTRAINT "site_profile_portrait_media_id_media_id_fkey" FOREIGN KEY ("portrait_media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "site_profile" ADD CONSTRAINT "site_profile_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "site_profile" ADD CONSTRAINT "site_profile_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_logo_media_id_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_industry_term_id_taxonomy_term_id_fkey" FOREIGN KEY ("industry_term_id") REFERENCES "taxonomy_term"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD CONSTRAINT "inhouse_program_image_media_id_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD CONSTRAINT "inhouse_program_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD CONSTRAINT "inhouse_program_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "testimonial" ADD CONSTRAINT "testimonial_photo_media_id_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "testimonial" ADD CONSTRAINT "testimonial_workshop_id_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshop"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "testimonial" ADD CONSTRAINT "testimonial_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "testimonial" ADD CONSTRAINT "testimonial_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD CONSTRAINT "taxonomy_term_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "taxonomy_term" ADD CONSTRAINT "taxonomy_term_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workshop" ADD CONSTRAINT "workshop_hero_media_id_media_id_fkey" FOREIGN KEY ("hero_media_id") REFERENCES "media"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "workshop" ADD CONSTRAINT "workshop_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workshop" ADD CONSTRAINT "workshop_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workshop_session" ADD CONSTRAINT "workshop_session_workshop_id_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshop"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "workshop_session" ADD CONSTRAINT "workshop_session_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workshop_session" ADD CONSTRAINT "workshop_session_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workshop_tag" ADD CONSTRAINT "workshop_tag_workshop_id_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshop"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workshop_tag" ADD CONSTRAINT "workshop_tag_term_id_taxonomy_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "taxonomy_term"("id") ON DELETE RESTRICT;