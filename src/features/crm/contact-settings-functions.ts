import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/db";
import { adminMiddleware } from "@/lib/access.functions";
import { crmContactSettingsSchema } from "./contact-settings-schemas";
import { getCrmContactSettings, saveCrmContactSettings } from "./contact-settings";

export const $getCrmContactSettings = createServerFn({ method: "GET" }).middleware([adminMiddleware])
  .handler(({ context }) => getCrmContactSettings(getDb(), context.actor));

export const $saveCrmContactSettings = createServerFn({ method: "POST" }).middleware([adminMiddleware])
  .validator(crmContactSettingsSchema)
  .handler(({ data, context }) => saveCrmContactSettings(getDb(), context.actor, data));

export const crmContactSettingsQueryOptions = () => queryOptions({
  queryKey: ["crm-contact-settings"], queryFn: () => $getCrmContactSettings(), retry: false
});
