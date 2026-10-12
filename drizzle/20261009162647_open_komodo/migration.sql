ALTER TABLE "inhouse_program" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
WITH "base" AS (
  SELECT
    "id",
    coalesce(
      nullif(trim(BOTH '-' FROM regexp_replace(replace(lower("title"), '&', ' and '), '[^a-z0-9]+', '-', 'g')), ''),
      'program'
    ) AS "base_slug",
    "created_at"
  FROM "inhouse_program"
),
"numbered" AS (
  SELECT
    "id",
    "base_slug",
    row_number() OVER (PARTITION BY "base_slug" ORDER BY "created_at", "id") AS "n"
  FROM "base"
)
UPDATE "inhouse_program"
SET "slug" = CASE WHEN "numbered"."n" = 1 THEN "numbered"."base_slug" ELSE "numbered"."base_slug" || '-' || "numbered"."n" END
FROM "numbered"
WHERE "inhouse_program"."id" = "numbered"."id";--> statement-breakpoint
ALTER TABLE "inhouse_program" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD CONSTRAINT "inhouse_program_slug_key" UNIQUE("slug");
