import { z } from "zod";
import { registrationListSchema, registrationSessionListSchema } from "./registration-staff-schemas";
import { pageOffset, pageSize, paginationSearchSchema } from "@/features/shared/pagination";

// Detail links carry the workspace state so Back restores the reviewed list.
export const registrationWorkspaceSearchSchema = registrationListSchema.pick({ filter: true, search: true, sort: true, direction: true }).extend({
  tab: z.enum(["overview", "registrations"]).default("overview"),
  runWhen: z.enum(["upcoming", "past", "all"]).catch("upcoming"),
  runStatus: registrationSessionListSchema.shape.status,
  runOffset: pageOffset,
  runSort: registrationSessionListSchema.shape.sort,
  runDirection: registrationSessionListSchema.shape.direction,
  runLimit: pageSize
}).and(paginationSearchSchema).transform(search => ({
  ...search, runOffset: Math.floor(search.runOffset / search.runLimit) * search.runLimit
}));
