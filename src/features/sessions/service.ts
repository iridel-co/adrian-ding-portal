import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, gt, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { registration, user, workshop, workshopSession } from "@/db/schema";
import {
  type createInput,
  type idInput,
  type listInput,
  SESSION_FIELD_LABELS,
  sessionOpenSchema,
  type statusInput,
  type suggestionInput,
  type updateInput
} from "@/features/sessions/schemas";
import { assertSessionTransition } from "@/features/sessions/status";
import type { Actor } from "@/features/shared/actor";
import {
  createdByValues,
  diffChanges,
  logActivity,
  updatedByValues
} from "@/features/shared/audit";
import type { DbOrTx } from "@/features/shared/db-types";
import { CmsValidationError } from "@/features/shared/errors";
import { assertPublishable } from "@/features/shared/publish";
import {
  dateToManilaLocal,
  hasSessionEnded,
  hasSessionStarted,
  manilaLocalToDate,
  manilaWallClock
} from "@/features/shared/time";

const ENTITY_TYPE = "workshop_session";

const SUGGESTION_LIMIT = 20;

/* Used when the workshop has no defaults yet. Staff set the real values on the session. */
const FALLBACK_PRICE_CENTAVOS = 0;

const FALLBACK_CAPACITY = 1;

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

export async function listSessions(db: DbOrTx, data: z.infer<typeof listInput>) {
  const whenConditions = {
    upcoming: isUpcomingCondition(),
    past: isPastCondition(),
    all: undefined
  };

  const rows = await db
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
}

export async function getSession(db: DbOrTx, data: z.infer<typeof idInput>) {
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
}

export async function createSession(db: DbOrTx, actor: Actor, data: z.infer<typeof createInput>) {
  return db.transaction(async (tx) => {
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
        ...createdByValues(actor.id)
      })
      .returning({ id: workshopSession.id });

    await logActivity(tx, {
      userId: actor.id,
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
}

export async function updateSession(db: DbOrTx, actor: Actor, data: z.infer<typeof updateInput>) {
  const { registrationCutoff, ...values } = data.values;
  const registrationCutoffAt = registrationCutoff ? manilaLocalToDate(registrationCutoff) : null;

  await db.transaction(async (tx) => {
    await tx.select({ id: workshopSession.id }).from(workshopSession).where(eq(workshopSession.id, data.id)).for("update");
    const before = await getSessionRow(tx, data.id);
    if (before.status === "cancelled") {
      throw new CmsValidationError("This session is cancelled and can't change.");
    }
    if (before.status === "open") {
      assertPublishable(sessionOpenSchema, values, SESSION_FIELD_LABELS);
    }

    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(registration)
      .where(and(eq(registration.workshopSessionId, data.id), isNull(registration.cancelledAt)));
    if (values.capacity < count) throw new CmsValidationError("Capacity cannot be lower than the active registration count.");

    const next = { ...values, registrationCutoffAt };

    await tx
      .update(workshopSession)
      .set({ ...next, ...updatedByValues(actor.id) })
      .where(eq(workshopSession.id, data.id));

    const changes = diffChanges(before, next);
    if (Object.keys(changes).length > 0) {
      await logActivity(tx, {
        userId: actor.id,
        action: "update",
        entityType: ENTITY_TYPE,
        entityId: data.id,
        changes
      });
    }
  });
}

export async function setSessionStatus(
  db: DbOrTx,
  actor: Actor,
  data: z.infer<typeof statusInput>
) {
  await db.transaction(async (tx) => {
    await tx.select({ id: workshopSession.id }).from(workshopSession).where(eq(workshopSession.id, data.id)).for("update");
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
      .set({ status: data.status, ...updatedByValues(actor.id) })
      .where(eq(workshopSession.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "status_change",
      entityType: ENTITY_TYPE,
      entityId: data.id,
      changes: { status: { from: before.status, to: data.status } }
    });
  });
}

/* Venue names or cities already used on sessions and workshop defaults. */
export async function listVenueSuggestions(db: DbOrTx, data: z.infer<typeof suggestionInput>) {
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
}
