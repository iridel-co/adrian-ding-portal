import { z } from "zod";

import { contentStatus } from "@/db/schema";
import {
  capacitySchema,
  centavosSchema,
  nonEmptyList,
  optionalHttpsUrl,
  stringListSchema
} from "@/features/shared/field-schemas";
import { listPageLimit, listPageOffset, sortDirection } from "@/features/shared/pagination";
import type { FieldLabels } from "@/features/shared/publish";

/* What the editor saves. A draft needs only a title and a valid slug. */
export const workshopSaveSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  slug: z.string().trim(),
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

export const workshopListSort = z
  .enum(["title", "courseCode", "status", "nextSessionDate", "updatedAt"])
  .default("updatedAt");

/* Without a limit the list returns every match, e.g. for pickers. */
export const listInput = z.object({
  status: statusFilterSchema.default("active"),
  search: z.string().trim().default(""),
  sort: workshopListSort,
  direction: sortDirection,
  limit: listPageLimit,
  offset: listPageOffset
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
