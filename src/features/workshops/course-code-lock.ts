import type { DbOrTx } from "@/features/shared/db-types";
import { and, eq, isNull } from "drizzle-orm";
import { registration, workshopSession } from "@/db/schema";

/*
  True when the CRM has active registrations for any session of the workshop.
  The CRM owns registrations, so it supplies the real check.
*/
export async function isCourseCodeLocked(db: DbOrTx, workshopId: string) {
  const [active] = await db.select({ id: registration.id }).from(registration)
    .innerJoin(workshopSession, eq(workshopSession.id, registration.workshopSessionId))
    .where(and(eq(workshopSession.workshopId, workshopId), isNull(registration.cancelledAt))).limit(1);
  return Boolean(active);
}
