import "@tanstack/react-start/server-only";
import { and, asc, eq, inArray } from "drizzle-orm";

import { media, taxonomyTerm, workshop, workshopSession, workshopTag } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { NotFoundError } from "@/features/shared/errors";
import { toPrice, toPublicMedia } from "@/features/shared/public-api";
import { MANILA_TIME_ZONE } from "@/features/shared/time";
import {
  isNotArchived,
  isPublished,
  isRegistrationOpen,
  isUpcomingSession,
  upcomingPublicSessionCondition
} from "@/features/shared/visibility";

type SessionRow = typeof workshopSession.$inferSelect;

export function toPublicSession(session: SessionRow, now: Date = new Date()) {
  return {
    id: session.id,
    date: session.date,
    endDate: session.endDate,
    startTime: session.startTime.slice(0, 5),
    endTime: session.endTime.slice(0, 5),
    timezone: MANILA_TIME_ZONE,
    venueName: session.venueName,
    city: session.city,
    venueMapUrl: session.venueMapUrl,
    registrationCutoffAt: session.registrationCutoffAt?.toISOString() ?? null,
    price: toPrice(session.priceCentavos, session.priceNote),
    capacity: session.capacity,
    status: session.status,
    isRegistrationOpen: isRegistrationOpen(session, now)
  };
}

export type PublicSession = ReturnType<typeof toPublicSession>;

/* Upcoming open or closed sessions for each workshop, sorted by start. */
export function groupUpcomingSessions(sessions: SessionRow[], now: Date = new Date()) {
  const byWorkshop = new Map<string, PublicSession[]>();
  const sorted = sessions
    .filter((session) => isUpcomingSession(session, now))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));

  for (const session of sorted) {
    const list = byWorkshop.get(session.workshopId) ?? [];
    list.push(toPublicSession(session, now));
    byWorkshop.set(session.workshopId, list);
  }
  return byWorkshop;
}

export function findNextSession(sessions: PublicSession[] = []) {
  return sessions.find((session) => session.status === "open") ?? null;
}

async function loadWorkshops(db: DbOrTx, slug?: string) {
  return db
    .select({ workshop, heroMedia: media })
    .from(workshop)
    .leftJoin(media, and(eq(media.id, workshop.heroMediaId), isNotArchived(media.archivedAt)))
    .where(and(isPublished(workshop.status), slug ? eq(workshop.slug, slug) : undefined))
    .orderBy(asc(workshop.title));
}

async function loadTags(db: DbOrTx, workshopIds: string[]) {
  if (workshopIds.length === 0) return new Map<string, string[]>();

  const rows = await db
    .select({ workshopId: workshopTag.workshopId, name: taxonomyTerm.name })
    .from(workshopTag)
    .innerJoin(taxonomyTerm, eq(taxonomyTerm.id, workshopTag.termId))
    .where(
      and(inArray(workshopTag.workshopId, workshopIds), isNotArchived(taxonomyTerm.archivedAt))
    )
    .orderBy(asc(workshopTag.position));

  const byWorkshop = new Map<string, string[]>();
  for (const row of rows) {
    byWorkshop.set(row.workshopId, [...(byWorkshop.get(row.workshopId) ?? []), row.name]);
  }
  return byWorkshop;
}

async function loadSessions(db: DbOrTx, workshopIds: string[], now: Date) {
  if (workshopIds.length === 0) return new Map<string, PublicSession[]>();

  const rows = await db
    .select()
    .from(workshopSession)
    .where(
      and(inArray(workshopSession.workshopId, workshopIds), upcomingPublicSessionCondition(now))
    );

  return groupUpcomingSessions(rows, now);
}

type ListFilters = {
  tag?: string;
  upcoming: boolean;
};

export async function listPublicWorkshops(db: DbOrTx, filters: ListFilters) {
  const now = new Date();
  const rows = await loadWorkshops(db);
  const ids = rows.map((row) => row.workshop.id);
  const [tags, sessions] = await Promise.all([loadTags(db, ids), loadSessions(db, ids, now)]);
  const tagFilter = filters.tag?.toLowerCase();

  const items = rows.map(({ workshop: row, heroMedia }) => ({
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    heroImage: toPublicMedia(heroMedia),
    tags: tags.get(row.id) ?? [],
    defaultPrice: toPrice(row.defaultPriceCentavos, row.defaultPriceNote),
    nextSession: findNextSession(sessions.get(row.id))
  }));

  return items
    .filter((item) => !tagFilter || item.tags.some((tag) => tag.toLowerCase() === tagFilter))
    .filter((item) => !filters.upcoming || item.nextSession !== null)
    .sort((a, b) => {
      if (a.nextSession && b.nextSession)
        return a.nextSession.date.localeCompare(b.nextSession.date);
      if (a.nextSession) return -1;
      if (b.nextSession) return 1;
      return a.title.localeCompare(b.title);
    });
}

export async function getPublicWorkshopBySlug(db: DbOrTx, slug: string) {
  const now = new Date();
  const [found] = await loadWorkshops(db, slug);
  if (!found) throw new NotFoundError("Workshop not found.");

  const { workshop: row, heroMedia } = found;
  const [tags, sessions] = await Promise.all([
    loadTags(db, [row.id]),
    loadSessions(db, [row.id], now)
  ]);

  return {
    slug: row.slug,
    courseCode: row.courseCode,
    title: row.title,
    summary: row.summary,
    problem: row.problem,
    intro: row.intro,
    audience: row.audience,
    format: row.format,
    heroImage: toPublicMedia(heroMedia),
    primerVideoUrl: row.primerVideoUrl,
    primerBlurb: row.primerBlurb,
    defaultVenue: {
      name: row.defaultVenueName,
      city: row.defaultCity,
      mapUrl: row.defaultVenueMapUrl
    },
    defaultPrice: toPrice(row.defaultPriceCentavos, row.defaultPriceNote),
    defaultCapacity: row.defaultCapacity,
    outcomes: row.outcomes,
    curriculum: row.curriculum,
    inclusions: row.inclusions,
    whatToExpect: row.whatToExpect,
    tags: tags.get(row.id) ?? [],
    sessions: sessions.get(row.id) ?? []
  };
}
