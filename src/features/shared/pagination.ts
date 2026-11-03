import { z } from "zod";

export const pageSizes = [10, 25, 50, 100] as const;
export const pageSize = z.coerce.number().pipe(z.union([
  z.literal(10), z.literal(25), z.literal(50), z.literal(100)
])).catch(25).default(25);
export const pageOffset = z.coerce.number().int().min(0).max(100000).catch(0).default(0);
export const sortDirection = z.enum(["asc", "desc"]).default("desc");
export const listPageLimit = z.number().int().min(1).max(100).optional();
export const listPageOffset = z.number().int().min(0).max(100000).default(0);
export const paginationSearchSchema = z.object({ limit: pageSize, offset: pageOffset })
  .transform(page => ({ ...page, offset: Math.floor(page.offset / page.limit) * page.limit }));
