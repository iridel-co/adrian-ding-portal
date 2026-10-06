import { z } from "zod";

import { MEDIA_CONTENT_TYPES } from "@/features/media/rules";

export const uploadRequestInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(MEDIA_CONTENT_TYPES),
  sizeBytes: z.number().int().positive()
});

export const uploadConfirmInput = z.object({
  key: z.string().startsWith("media/"),
  fileName: z.string().trim().min(1).max(255),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  alt: z.string().trim().max(500)
});

export const listInput = z.object({
  search: z.string().trim().default(""),
  includeArchived: z.boolean().default(false)
});

export const idInput = z.object({
  id: z.uuid()
});

export const altInput = z.object({
  id: z.uuid(),
  alt: z.string().trim().max(500)
});
