import { z } from "zod";

import { contentStatus } from "@/db/schema";
import {
  capacitySchema,
  centavosSchema,
  nonEmptyList,
  optionalHttpsUrl,
  stringListSchema
} from "@/features/shared/field-schemas";
import type { FieldLabels } from "@/features/shared/publish";

export const COURSE_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

const courseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .regex(COURSE_CODE_PATTERN, "Use 2 to 8 capital letters or digits, e.g. PSW.")
      .nullable()
  );

/* What the editor saves. A draft needs only a title and a valid slug. */
export const workshopSaveSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  slug: z.string().trim(),
  courseCode: courseCodeSchema,
  summary: z.string().trim(),
  problem: z.string().trim(),
  intro: z.string().trim(),
  audience: z.string().trim(),
  format: z.string().trim(),
  heroMediaId: z.uuid().nullable(),
  primerVideoUrl: optionalHttpsUrl,
  primerBlurb: z.string().trim(),
  defaultVenueName: z.string().trim(),
  defaultCity: z.string().trim(),
  defaultVenueMapUrl: optionalHttpsUrl,
  defaultPriceCentavos: centavosSchema.nullable(),
  defaultPriceNote: z.string().trim(),
  defaultCapacity: capacitySchema.nullable(),
  outcomes: stringListSchema,
  curriculum: stringListSchema,
  inclusions: stringListSchema,
  whatToExpect: stringListSchema,
  tagIds: z.array(z.uuid())
});

export type WorkshopSaveInput = z.input<typeof workshopSaveSchema>;

/* What a workshop needs before it can be published. */
export const workshopPublishSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  courseCode: z.string().min(1),
  summary: z.string().min(1),
  intro: z.string().min(1),
  heroMediaId: z.string().min(1),
  defaultPriceCentavos: z.number(),
  defaultCapacity: z.number(),
  tagIds: nonEmptyList,
  outcomes: nonEmptyList,
  curriculum: nonEmptyList
});

export const WORKSHOP_FIELD_LABELS: FieldLabels = {
  title: "Title",
  slug: "Slug",
  courseCode: "Course code",
  summary: "Summary",
  intro: "Intro",
  heroMediaId: "Hero image",
  defaultPriceCentavos: "Default price",
  defaultCapacity: "Default capacity",
  tagIds: "At least one tag",
  outcomes: "At least one outcome",
  curriculum: "At least one curriculum item"
};

export const statusFilterSchema = z.enum(["active", ...contentStatus.enumValues]);

export const listInput = z.object({
  status: statusFilterSchema.default("active"),
  search: z.string().trim().default("")
});

export const idInput = z.object({
  id: z.uuid()
});

export const createInput = z.object({
  title: z.string().trim().min(1, "Enter a title.")
});

export const updateInput = z.object({
  id: z.uuid(),
  values: workshopSaveSchema
});

export const statusInput = z.object({
  id: z.uuid(),
  status: z.enum(contentStatus.enumValues)
});
