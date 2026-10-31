import { workshopSort, sortDirection } from "./sorting";
import { z } from "zod";
import { registrationListSchema } from "./registration-staff-schemas";
import { crmPageOffset, crmPageSize, crmPaginationSearchSchema } from "./pagination";

// Detail links carry the workspace state so Back restores the reviewed list.
export const registrationWorkspaceSearchSchema = registrationListSchema.pick({ filter: true, search: true, sort: true, direction: true }).extend({
  tab: z.enum(["overview", "registrations"]).default("overview"),
  runWhen: z.enum(["upcoming", "past", "all"]).catch("upcoming"),
  runOffset: crmPageOffset,
  runSort: workshopSort,
  runDirection: sortDirection,
  runLimit: crmPageSize
}).and(crmPaginationSearchSchema).transform(search => ({
  ...search, runOffset: Math.floor(search.runOffset / search.runLimit) * search.runLimit
}));
