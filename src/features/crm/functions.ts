import { queryOptions } from "@tanstack/react-query";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDb } from "@/db";
import { authMiddleware } from "@/lib/auth.functions";
import { authorizeStaff } from "./staff-http";
import { IntakeError } from "./service";
import { eventDetail, eventListSchema, listEvents, listRegistrations, registrationListSchema, registrationDetail, pageSchema } from "./staff";

export const $crmAccess = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  setResponseHeader("Cache-Control", "no-store");
  try {
    await authorizeStaff(getDb(), context.user.id, process.env.ADMIN_EMAILS ?? "");
    return true;
  } catch (error) {
    if (error instanceof IntakeError && error.status === 403) return false;
    throw error;
  }
});

const crmMiddleware = createMiddleware().middleware([authMiddleware]).server(async ({ next, context }) => {
  setResponseHeader("Cache-Control", "no-store");
  const staff = await authorizeStaff(getDb(), context.user.id, process.env.ADMIN_EMAILS ?? "");
  return next({ context: { staff } });
});

export const $listCrmEvents = createServerFn({ method: "GET" }).middleware([crmMiddleware]).validator(eventListSchema)
  .handler(({ data }) => listEvents(getDb(), data));
export const $getCrmEvent = createServerFn({ method: "GET" }).middleware([crmMiddleware]).validator(z.strictObject({ id: z.uuid() }))
  .handler(({ data }) => eventDetail(getDb(), data.id));
export const $listCrmRegistrations = createServerFn({ method: "GET" }).middleware([crmMiddleware])
  .validator(registrationListSchema.extend({ workshopSessionId: z.uuid() }))
  .handler(({ data }) => listRegistrations(getDb(), data.workshopSessionId, data));
export const $getCrmRegistration = createServerFn({ method: "GET" }).middleware([crmMiddleware])
  .validator(pageSchema.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const detail = await registrationDetail(getDb(), data.id, data);
    return { ...detail, history: detail.history.map(entry => ({
      id: entry.id, createdAt: entry.createdAt,
      paymentFrom: entry.changes.paymentStatus?.from === "paid" ? "Paid" : "Unpaid",
      paymentTo: entry.changes.paymentStatus ? entry.changes.paymentStatus.to === "paid" ? "Paid" : "Unpaid" : null,
      cancelled: !!entry.changes.cancelledAt,
      reason: typeof entry.changes.reason?.to === "string" ? entry.changes.reason.to : null,
      actor: z.object({ name: z.string(), email: z.string() }).safeParse(entry.changes.actor?.to).data ?? null
    })) };
  });

export const crmRegistrationQueryOptions = (id: string, offset = 0) => queryOptions({
  queryKey: ["crm", "registration", id, offset], queryFn: ({ signal }) => $getCrmRegistration({ data: { id, offset }, signal }), retry: false
});

export const crmAccessQueryOptions = () => queryOptions({ queryKey: ["crm", "access"], queryFn: ({ signal }) => $crmAccess({ signal }), retry: false });
export const crmEventsQueryOptions = (input: z.input<typeof eventListSchema>) => queryOptions({
  queryKey: ["crm", "events", input], queryFn: ({ signal }) => $listCrmEvents({ data: input, signal }), retry: false
});
export const crmEventQueryOptions = (id: string) => queryOptions({
  queryKey: ["crm", "event", id], queryFn: ({ signal }) => $getCrmEvent({ data: { id }, signal }), retry: false
});
export const crmRegistrationsQueryOptions = (input: z.input<typeof registrationListSchema> & { workshopSessionId: string }) => queryOptions({
  queryKey: ["crm", "registrations", input], queryFn: ({ signal }) => $listCrmRegistrations({ data: input, signal }), retry: false
});
