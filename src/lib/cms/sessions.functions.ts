import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { sessionStatus, user, workshop, workshopSession } from "@/db/schema";
import { authMiddleware } from "@/lib/auth.functions";
import { createdByValues, diffChanges, logActivity, updatedByValues } from "@/lib/cms/audit";
import type { DbOrTx } from "@/lib/cms/db-types";
import { CmsValidationError } from "@/lib/cms/errors";
import { assertPublishable } from "@/lib/cms/publish";
import {
  SESSION_FIELD_LABELS,
  sessionOpenSchema,
  sessionSaveSchema,
  sessionTimesSchema
} from "@/lib/cms/session-schemas";
import { assertSessionTransition } from "@/lib/cms/session-status";
import {
  dateToManilaLocal,
  hasSessionEnded,
  hasSessionStarted,
  manilaLocalToDate,
  manilaWallClock
} from "@/lib/cms/time";

const ENTITY_TYPE = "workshop_session";

const SUGGESTION_LIMIT = 20;

/* Used when the workshop has no defaults yet. Staff set the real values on the session. */
const FALLBACK_PRICE_CENTAVOS = 0;
const FALLBACK_CAPACITY = 1;

const listInput = z.object({
  when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  status: z.enum(["any", ...sessionStatus.enumValues]).default("any"),
  workshopId: z.uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
});

const idInput = z.object({
  id: z.uuid()
});

const createInput = z.object({
  workshopId: z.uuid(),
  times: sessionTimesSchema
});

const updateInput = z.object({
  id: z.uuid(),
  values: sessionSaveSchema
});

const statusInput = z.object({
  id: z.uuid(),
  status: z.enum(sessionStatus.enumValues)
});

const suggestionInput = z.object({
  field: z.enum(["venueName", "city"]),
  query: z.string().trim().default("")
});

/* Sessions whose last day has ended in Manila. */
function isPastCondition() {
  const now = manilaWallClock();
  return or(
    lt(workshopSession.endDate, now.date),
    and(eq(workshopSession.endDate, now.date), sql`${workshopSession.endTime} <= ${now.time}`)
  );
}

function isUpcomingCondition() {
  const now = manilaWallClock();
  return or(
    gt(workshopSession.endDate, now.date),
    and(eq(workshopSession.endDate, now.date), sql`${workshopSession.endTime} > ${now.time}`)
  );
}

/* Sessions with at least one day in the month. */
function monthCondition(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = `${month}-01`;
  const nextMonth =
    monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;

  return and(sql`${workshopSession.endDate} >= ${firstDay}`, lt(workshopSession.date, nextMonth));
}

async function getSessionRow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(workshopSession).where(eq(workshopSession.id, id));
  if (!row) throw new CmsValidationError("This session no longer exists.");
  return row;
}

async function getWorkshopRow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(workshop).where(eq(workshop.id, id));
  if (!row) throw new CmsValidationError("This workshop no longer exists.");
  return row;
}

export const $listSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(async ({ data }) => {
    const whenConditions = {
      upcoming: isUpcomingCondition(),
      past: isPastCondition(),
      all: undefined
    };

    const rows = await getDb()
      .select({
        id: workshopSession.id,
        date: workshopSession.date,
        endDate: workshopSession.endDate,
        startTime: workshopSession.startTime,
        endTime: workshopSession.endTime,
        venueName: workshopSession.venueName,
        city: workshopSession.city,
        priceCentavos: workshopSession.priceCentavos,
        capacity: workshopSession.capacity,
        status: workshopSession.status,
        workshopId: workshop.id,
        workshopTitle: workshop.title
      })
      .from(workshopSession)
      .innerJoin(workshop, eq(workshop.id, workshopSession.workshopId))
      .where(
        and(
          whenConditions[data.when],
          data.status === "any" ? undefined : eq(workshopSession.status, data.status),
          data.workshopId ? eq(workshopSession.workshopId, data.workshopId) : undefined,
          data.month ? monthCondition(data.month) : undefined
        )
      )
      .orderBy(
        data.when === "past" ? desc(workshopSession.date) : asc(workshopSession.date),
        asc(workshopSession.startTime)
      );

    return rows.map((row) => ({ ...row, isPast: hasSessionEnded(row) }));
  });

export const $getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb();
    const session = await getSessionRow(db, data.id);
    const parent = await getWorkshopRow(db, session.workshopId);

    const [editor] = session.updatedBy
      ? await db.select({ name: user.name }).from(user).where(eq(user.id, session.updatedBy))
      : [];

    return {
      session,
      registrationCutoff: session.registrationCutoffAt
        ? dateToManilaLocal(session.registrationCutoffAt)
        : "",
      workshop: {
        id: parent.id,
        title: parent.title,
        status: parent.status
      },
      hasStarted: hasSessionStarted(session),
      isPast: hasSessionEnded(session),
      updatedByName: editor?.name ?? null
    };
  });

export const $createSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(async ({ data, context }) => {
    return getDb().transaction(async (tx) => {
      const parent = await getWorkshopRow(tx, data.workshopId);
      if (parent.status === "archived") {
        throw new CmsValidationError("This workshop is archived. Restore it first.");
      }

      const [row] = await tx
        .insert(workshopSession)
        .values({
          workshopId: parent.id,
          ...data.times,
          venueName: parent.defaultVenueName,
          city: parent.defaultCity,
          venueMapUrl: parent.defaultVenueMapUrl,
          priceCentavos: parent.defaultPriceCentavos ?? FALLBACK_PRICE_CENTAVOS,
          priceNote: parent.defaultPriceNote,
          capacity: parent.defaultCapacity ?? FALLBACK_CAPACITY,
          ...createdByValues(context.user.id)
        })
        .returning({ id: workshopSession.id });

      await logActivity(tx, {
        userId: context.user.id,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: row.id,
        changes: {
          workshopId: { from: null, to: parent.id },
          date: { from: null, to: data.times.date }
        }
      });

      return row;
    });
  });

export const $updateSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateInput)
  .handler(async ({ data, context }) => {
    const { registrationCutoff, ...values } = data.values;
    const registrationCutoffAt = registrationCutoff ? manilaLocalToDate(registrationCutoff) : null;

    await getDb().transaction(async (tx) => {
      const before = await getSessionRow(tx, data.id);
      if (before.status === "cancelled") {
        throw new CmsValidationError("This session is cancelled and can't change.");
      }
      if (before.status === "open") {
        assertPublishable(sessionOpenSchema, values, SESSION_FIELD_LABELS);
      }

      const next = { ...values, registrationCutoffAt };

      await tx
        .update(workshopSession)
        .set({ ...next, ...updatedByValues(context.user.id) })
        .where(eq(workshopSession.id, data.id));

      const changes = diffChanges(before, next);
      if (Object.keys(changes).length > 0) {
        await logActivity(tx, {
          userId: context.user.id,
          action: "update",
          entityType: ENTITY_TYPE,
          entityId: data.id,
          changes
        });
      }
    });
  });

export const $setSessionStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      const before = await getSessionRow(tx, data.id);
      assertSessionTransition(before.status, data.status, {
        hasStarted: hasSessionStarted(before),
        hasEnded: hasSessionEnded(before)
      });

      if (data.status === "open") {
        const parent = await getWorkshopRow(tx, before.workshopId);
        if (parent.status !== "published") {
          throw new CmsValidationError("Publish the workshop before you open its sessions.");
        }
        assertPublishable(sessionOpenSchema, before, SESSION_FIELD_LABELS);
      }

      await tx
        .update(workshopSession)
        .set({ status: data.status, ...updatedByValues(context.user.id) })
        .where(eq(workshopSession.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "status_change",
        entityType: ENTITY_TYPE,
        entityId: data.id,
        changes: { status: { from: before.status, to: data.status } }
      });
    });
  });

/* Venue names or cities already used on sessions and workshop defaults. */
export const $listVenueSuggestions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(suggestionInput)
  .handler(async ({ data }) => {
    const db = getDb();
    const isVenueName = data.field === "venueName";
    const sessionColumn = isVenueName ? workshopSession.venueName : workshopSession.city;
    const workshopColumn = isVenueName ? workshop.defaultVenueName : workshop.defaultCity;
    const pattern = `%${data.query}%`;

    const [fromSessions, fromWorkshops] = await Promise.all([
      db
        .selectDistinct({ value: sessionColumn })
        .from(workshopSession)
        .where(and(sql`${sessionColumn} <> ''`, ilike(sessionColumn, pattern)))
        .limit(SUGGESTION_LIMIT),
      db
        .selectDistinct({ value: workshopColumn })
        .from(workshop)
        .where(and(sql`${workshopColumn} <> ''`, ilike(workshopColumn, pattern)))
        .limit(SUGGESTION_LIMIT)
    ]);

    const values = new Set([...fromSessions, ...fromWorkshops].map((row) => row.value));
    return [...values].sort().slice(0, SUGGESTION_LIMIT);
  });

export type SessionListItem = Awaited<ReturnType<typeof $listSessions>>[number];

export type SessionDetail = Awaited<ReturnType<typeof $getSession>>;

export const sessionsQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["sessions", "list", input],
    queryFn: () => $listSessions({ data: input })
  });

export const sessionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["sessions", "detail", id],
    queryFn: () => $getSession({ data: { id } })
  });

export const venueSuggestionsQueryOptions = (input: z.input<typeof suggestionInput>) =>
  queryOptions({
    queryKey: ["sessions", "venue-suggestions", input],
    queryFn: () => $listVenueSuggestions({ data: input })
  });
