import { z } from "zod";

import { contentStatus } from "@/db/schema";
import { nonEmptyList, stringListSchema } from "@/features/shared/field-schemas";
import type { FieldLabels } from "@/features/shared/publish";

export const SUMMARY_MAX_LENGTH = 160;
export const USEFUL_FOR_MAX_ITEMS = 6;

/* What the editor saves. A draft needs only a title and a valid slug. */
export const programSaveSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  slug: z.string().trim(),
  summary: z.string().trim().max(SUMMARY_MAX_LENGTH, `Keep the summary to ${SUMMARY_MAX_LENGTH} characters.`),
  imageMediaId: z.uuid().nullable(),
  usefulFor: stringListSchema.pipe(
    z.array(z.string()).max(USEFUL_FOR_MAX_ITEMS, `Add at most ${USEFUL_FOR_MAX_ITEMS} "Useful for" items.`)
  )
});

export const programPublishSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().min(1),
  imageMediaId: z.string().min(1),
  usefulFor: nonEmptyList
});

export const PROGRAM_FIELD_LABELS: FieldLabels = {
  title: "Title",
  slug: "Slug",
  summary: "Summary",
  imageMediaId: "Card image",
  usefulFor: "At least one \"Useful for\" item"
};

export const statusFilterSchema = z.enum(["active", ...contentStatus.enumValues]);

export const listInput = z.object({
  status: statusFilterSchema.default("active")
});

export const idInput = z.object({
  id: z.uuid()
});

export const createInput = z.object({
  title: z.string().trim().min(1, "Enter a title.")
});

export const updateInput = z.object({
  id: z.uuid(),
  values: programSaveSchema
});

export const statusInput = z.object({
  id: z.uuid(),
  status: z.enum(contentStatus.enumValues)
});

export const reorderInput = z.object({
  ids: z.array(z.uuid())
});
