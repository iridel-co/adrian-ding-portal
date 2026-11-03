import type { z } from "zod";

import { CmsValidationError } from "@/features/shared/errors";

export type FieldLabels = Record<string, string>;

const FIELD_MESSAGE = "Fill this before publishing.";

function findMissingKeys(schema: z.ZodType, item: unknown) {
  const result = schema.safeParse(item);
  if (result.success) return [];

  const fields = result.error.issues.map((issue) => String(issue.path[0] ?? ""));
  return [...new Set(fields)];
}

/* Lists the fields that fail the publish schema, by label. Empty when the item can be published. */
export function findMissingFields(schema: z.ZodType, item: unknown, labels: FieldLabels) {
  return findMissingKeys(schema, item).map((field) => labels[field] ?? field);
}

/* Throws one summary issue, then one issue per missing field so the editor can mark each input. */
export function assertPublishable(schema: z.ZodType, item: unknown, labels: FieldLabels) {
  const missingKeys = findMissingKeys(schema, item);
  if (missingKeys.length === 0) return;

  const missingLabels = missingKeys.map((field) => labels[field] ?? field);
  const issues = [
    {
      path: [],
      message: `Fill these before publishing: ${missingLabels.join(", ")}.`
    },
    ...missingKeys.map((field) => ({
      path: [field],
      message: FIELD_MESSAGE
    }))
  ];

  throw new CmsValidationError(JSON.stringify(issues));
}

export type PublishCheck = {
  label: string;
  isDone: boolean;
};

/* Every publish requirement in label order, with whether the item meets it yet. */
export function publishChecklist(
  schema: z.ZodType,
  item: unknown,
  labels: FieldLabels
): PublishCheck[] {
  const missingKeys = new Set(findMissingKeys(schema, item));

  return Object.entries(labels).map(([field, label]) => ({
    label,
    isDone: !missingKeys.has(field)
  }));
}
