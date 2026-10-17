import { and, eq, isNull } from "drizzle-orm";
import { registration, workshopSession } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";

export async function isCourseCodeLocked(db: DbOrTx, workshopId: string) {
  const [active] = await db.select({ id: registration.id }).from(registration)
    .innerJoin(workshopSession, eq(registration.workshopSessionId, workshopSession.id))
    .where(and(eq(workshopSession.workshopId, workshopId), isNull(registration.cancelledAt))).limit(1);
  return Boolean(active);
}
