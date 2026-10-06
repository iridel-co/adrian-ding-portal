import type { z } from "zod";

import { CmsValidationError } from "@/features/shared/errors";

export type FieldLabels = Record<string, string>;

/* Lists the fields that fail the publish schema, by label. Empty when the item can be published. */
export function findMissingFields(schema: z.ZodType, item: unknown, labels: FieldLabels) {
  const result = schema.safeParse(item);
  if (result.success) return [];

  const fields = result.error.issues.map((issue) => String(issue.path[0] ?? ""));
  const uniqueFields = [...new Set(fields)];

  return uniqueFields.map((field) => labels[field] ?? field);
}

export function assertPublishable(schema: z.ZodType, item: unknown, labels: FieldLabels) {
  const missingFields = findMissingFields(schema, item, labels);

  if (missingFields.length > 0) {
    throw new CmsValidationError(`Fill these before publishing: ${missingFields.join(", ")}.`);
  }
}
