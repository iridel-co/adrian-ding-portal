import { z } from "zod";

export const crmPageSizes = [10, 25, 50, 100] as const;
export const crmPageSize = z.coerce.number().pipe(z.union([
  z.literal(10), z.literal(25), z.literal(50), z.literal(100)
])).catch(25).default(25);
export const crmPageOffset = z.coerce.number().int().min(0).max(100000).catch(0).default(0);
export const crmPaginationSearchSchema = z.object({ limit: crmPageSize, offset: crmPageOffset })
  .transform(page => ({ ...page, offset: Math.floor(page.offset / page.limit) * page.limit }));
