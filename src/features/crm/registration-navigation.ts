import { z } from "zod";
import { registrationListSchema } from "./registration-staff-schemas";

const pageOffset = z.coerce.number().int().min(0).max(100000).catch(0)
  .transform(offset => Math.floor(offset / 50) * 50);

// Detail links carry the workspace state so Back restores the reviewed list.
export const registrationWorkspaceSearchSchema = registrationListSchema.pick({ filter: true, search: true }).extend({
  tab: z.enum(["overview", "registrations"]).default("overview"),
  offset: pageOffset,
  runWhen: z.enum(["upcoming", "past", "all"]).catch("upcoming"),
  runOffset: pageOffset
});
