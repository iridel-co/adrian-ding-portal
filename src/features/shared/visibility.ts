import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { workshopSession } from "@/db/schema";
import {
  hasSessionEnded,
  manilaToday,
  manilaWallClock,
  normalizeTime
} from "@/features/shared/time";

/* What the public site is allowed to see. Every public query filters through these. */

export const PUBLIC_SESSION_STATUSES = ["open", "closed"] as const;

export function isPublished(statusColumn: PgColumn) {
  return eq(statusColumn, "published");
}

/* For media and taxonomy terms, which are archived instead of having a status. */
export function isNotArchived(archivedAtColumn: PgColumn) {
  return isNull(archivedAtColumn);
}

/*
  Open or closed sessions that end today or later. Sessions that already ended
  earlier today still match, so callers also filter with isUpcomingSession.
*/
export function upcomingPublicSessionCondition(now: Date = new Date()) {
  return and(
    inArray(workshopSession.status, PUBLIC_SESSION_STATUSES),
    gte(workshopSession.endDate, manilaToday(now))
  );
}

type SessionVisibility = {
  status: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  registrationCutoffAt: Date | null;
};

export function isUpcomingSession(session: SessionVisibility, now: Date = new Date()) {
  return (
    (PUBLIC_SESSION_STATUSES as readonly string[]).includes(session.status) &&
    !hasSessionEnded(session, now)
  );
}

/* Without a cutoff, registration closes when the session starts. */
export function isRegistrationOpen(session: SessionVisibility, now: Date = new Date()) {
  if (session.status !== "open") return false;
  if (session.registrationCutoffAt) return now < session.registrationCutoffAt;

  const current = manilaWallClock(now);
  return `${current.date}T${current.time}` < `${session.date}T${normalizeTime(session.startTime)}`;
}
