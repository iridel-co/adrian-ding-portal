import { z } from "zod";

import { taxonomyKind } from "@/db/schema";

export const kindSchema = z.enum(taxonomyKind.enumValues);

export type TaxonomyKind = z.infer<typeof kindSchema>;

export const nameSchema = z.string().trim().min(1, "Enter a name.").max(80);

export const listInput = z.object({
  kind: kindSchema,
  includeArchived: z.boolean().default(false)
});

export const createInput = z.object({
  kind: kindSchema,
  name: nameSchema
});

export const renameInput = z.object({
  id: z.uuid(),
  name: nameSchema
});

export const reorderInput = z.object({
  kind: kindSchema,
  ids: z.array(z.uuid())
});

export const idInput = z.object({
  id: z.uuid()
});
