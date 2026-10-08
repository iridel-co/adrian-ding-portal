import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import { account, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { readJson } from "./http";
import { sendEmailJob, type EmailTransport } from "./email";
import { IntakeError } from "./service";
import { cancellationSchema, changeRegistration, emailJobDetail, eventDetail, eventListSchema, listEvents, listInquiries, listRegistrations, pageSchema, paymentChangeSchema, registrationDetail, registrationListSchema } from "./staff";

export async function authorizeStaff(db: Db, userId: string | undefined, adminEmails: string) {
  if (!userId) throw new IntakeError(401, "authentication_required");
  // Read the current user and Google account, rather than trusting cached cookie fields.
  const [actor] = await db.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified })
    .from(user).innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "google"))).where(eq(user.id, userId)).limit(1);
  const allowed = adminEmails.split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!actor?.emailVerified || !allowed.includes(actor.email.trim().toLowerCase())) throw new IntakeError(403, "staff_access_required");
  return { id: actor.id, name: actor.name, email: actor.email.trim().toLowerCase() };
}

type Dependencies = { db: Db; userId?: string; adminEmails: string; portalUrl: string; apiKey?: string; emailTransport?: EmailTransport };
export async function handleStaffRequest(request: Request, dependencies?: Dependencies) {
  const respond = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie, Origin" } });
  try {
    const db = dependencies?.db ?? getDb();
    const session = dependencies ? null : await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
    const actor = await authorizeStaff(db, dependencies ? dependencies.userId : session?.user.id, dependencies?.adminEmails ?? process.env.ADMIN_EMAILS ?? "");
    const url = new URL(request.url);
    const portalOrigin = new URL(dependencies?.portalUrl ?? getEnv().BETTER_AUTH_URL).origin;
    const origin = request.headers.get("origin");
    if ((origin !== null && origin !== portalOrigin) || (request.method !== "GET" && origin !== portalOrigin)
      || request.headers.get("sec-fetch-site") === "cross-site") throw new IntakeError(403, "origin_not_allowed");
    const segments = url.pathname.replace(/^\/api\/crm\//, "").split("/");
    const [resource, rawId, action] = segments;
    const id = rawId ? z.uuid().safeParse(rawId) : null;
    if (id && !id.success) throw new IntakeError(400, "invalid_id");
    const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
      const result = schema.safeParse(value);
      if (!result.success) throw new IntakeError(400, "invalid_request");
      return result.data;
    };
    if (request.method === "GET" && segments.length <= 2) {
      const query = Object.fromEntries(url.searchParams);
      if (resource === "events" && !rawId) return respond(200, await listEvents(db, parse(eventListSchema, query)));
      if (resource === "events" && id?.success) {
        parse(z.strictObject({}), query);
        return respond(200, await eventDetail(db, id.data));
      }
      if (resource === "registrations" && !rawId) {
        const sessionId = parse(z.uuid(), query.workshopSessionId);
        delete query.workshopSessionId;
        return respond(200, await listRegistrations(db, sessionId, parse(registrationListSchema, query)));
      }
      if (resource === "registrations" && id?.success) return respond(200, await registrationDetail(db, id.data, parse(pageSchema, query)));
      if (resource === "corporate-inquiries" && !rawId) return respond(200, await listInquiries(db, parse(pageSchema, query)));
    }
    if (segments.length === 3 && id?.success) {
      if (resource === "registrations" && action === "payment" && request.method === "PATCH") {
        return respond(200, await changeRegistration(db, id.data, actor, { kind: "payment", input: parse(paymentChangeSchema, await readJson(request)) }));
      }
      if (resource === "registrations" && action === "cancel" && request.method === "POST") {
        return respond(200, await changeRegistration(db, id.data, actor, { kind: "cancel", input: parse(cancellationSchema, await readJson(request)) }));
      }
      if (resource === "emails" && action === "retry" && request.method === "POST") {
        parse(z.strictObject({}), await readJson(request));
        await emailJobDetail(db, id.data);
        const apiKey = dependencies?.apiKey ?? process.env.RESEND_API_KEY;
        if (!apiKey?.trim()) throw new IntakeError(503, "email_unavailable");
        await sendEmailJob(db, id.data, apiKey, dependencies?.emailTransport);
        return respond(200, await emailJobDetail(db, id.data));
      }
    }
    throw new IntakeError(404, "route_not_found");
  } catch (error) {
    return respond(error instanceof IntakeError ? error.status : 503, { error: { code: error instanceof IntakeError ? error.code : "crm_unavailable" } });
  }
}
