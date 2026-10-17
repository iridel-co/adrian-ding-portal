import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";
import { registrationReferenceCounter } from "@/db/schema";
import type { Tx } from "@/features/shared/db-types";

// Call in the registration transaction so failed submissions roll back the counter too.
export async function allocateRegistrationReference(tx: Tx, courseCode: string) {
  const [counter] = await tx.insert(registrationReferenceCounter).values({ courseCode, lastNumber: 1 })
    .onConflictDoUpdate({ target: registrationReferenceCounter.courseCode,
      set: { lastNumber: sql`${registrationReferenceCounter.lastNumber} + 1` } })
    .returning({ lastNumber: registrationReferenceCounter.lastNumber });
  return `AD-${courseCode}-${String(counter.lastNumber).padStart(4, "0")}`;
}
