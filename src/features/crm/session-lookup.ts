import "@tanstack/react-start/server-only";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import { registration, workshop, workshopSession } from "@/db/schema";
import { manilaWallClock } from "@/features/shared/time";
import { getSiteOrigins } from "@/lib/env";
import { IntakeError } from "./service";

const querySchema = z.strictObject({
  workshopSlug: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
});

export async function handleSessionLookup(request: Request, dependencies?: { db: Db; origins: string[]; now?: Date }) {
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
  const respond = (status: number, body?: unknown) => {
    if (body !== undefined) headers.set("Content-Type", "application/json");
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  };
  try {
    const origin = request.headers.get("origin");
    const origins = dependencies?.origins ?? getSiteOrigins();
    if (origin !== null) {
      if (!origins.includes(origin)) throw new IntakeError(403, "origin_not_allowed");
      headers.set("Access-Control-Allow-Origin", origin);
    }
    if (request.method === "OPTIONS") {
      if (request.headers.get("access-control-request-method") !== "GET" || request.headers.get("access-control-request-headers")?.trim()) {
        throw new IntakeError(403, "preflight_not_allowed");
      }
      headers.set("Access-Control-Allow-Methods", "GET");
      return respond(204);
    }
    if (request.method !== "GET") { headers.set("Allow", "GET, OPTIONS"); throw new IntakeError(405, "method_not_allowed"); }
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new IntakeError(400, "invalid_request");
    const { workshopSlug, limit, offset } = parsed.data;
    const now = dependencies?.now ?? new Date();
    const clock = manilaWallClock(now);
    const db = dependencies?.db ?? getDb();
    const rows = await db.select({
      id: workshopSession.id, workshopSlug: workshop.slug, workshopTitle: workshop.title,
      date: workshopSession.date, endDate: workshopSession.endDate, startTime: workshopSession.startTime, endTime: workshopSession.endTime,
      venueName: workshopSession.venueName, city: workshopSession.city, venueMapUrl: workshopSession.venueMapUrl,
      priceCentavos: workshopSession.priceCentavos, priceNote: workshopSession.priceNote, registrationCutoffAt: workshopSession.registrationCutoffAt,
      available: sql<boolean>`(select count(*) from ${registration} where ${registration.workshopSessionId} = ${workshopSession.id}
        and ${registration.cancelledAt} is null) < ${workshopSession.capacity}`
    }).from(workshopSession).innerJoin(workshop, eq(workshop.id, workshopSession.workshopId))
      .where(and(eq(workshop.slug, workshopSlug), eq(workshop.status, "published"), eq(workshopSession.status, "open"),
        or(gt(workshopSession.date, clock.date), and(eq(workshopSession.date, clock.date), gt(workshopSession.startTime, clock.time))),
        or(isNull(workshopSession.registrationCutoffAt), gt(workshopSession.registrationCutoffAt, now))))
      .orderBy(asc(workshopSession.date), asc(workshopSession.startTime), asc(workshopSession.id)).limit(limit + 1).offset(offset);
    return respond(200, { items: rows.slice(0, limit), hasMore: rows.length > limit, timeZone: "Asia/Manila" });
  } catch (error) {
    return respond(error instanceof IntakeError ? error.status : 503, { error: { code: error instanceof IntakeError ? error.code : "lookup_unavailable" } });
  }
}
