ALTER TABLE "inhouse_program" ADD COLUMN "image_focus_x" smallint DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD COLUMN "image_focus_y" smallint DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "inhouse_program" ADD CONSTRAINT "inhouse_program_image_focus_range" CHECK ("image_focus_x" BETWEEN 0 AND 100 AND "image_focus_y" BETWEEN 0 AND 100);
