import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";

import { workshop } from "@/db/schema";
import type { Tx } from "@/features/shared/db-types";
import { nextCourseCode } from "@/features/workshops/course-number";

/* Any constant works. It only has to differ from other advisory locks in this database. */
const COURSE_CODE_LOCK_KEY = 4_120_001;

const NUMERIC_CODE = sql`${workshop.courseCode} ~ '^[0-9]+$'`;

/* Call in the create or publish transaction. The lock makes two at once take different numbers. */
export async function allocateCourseCode(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${COURSE_CODE_LOCK_KEY})`);

  const [row] = await tx
    .select({ highest: sql<string | null>`max(${workshop.courseCode}::integer)` })
    .from(workshop)
    .where(NUMERIC_CODE);

  return nextCourseCode(row?.highest ? Number(row.highest) : null);
}

/* Sorts number codes by value, so 1000 comes after 999. Letter codes sort after them. */
export const courseCodeSortKey = sql`case when ${NUMERIC_CODE} then lpad(${workshop.courseCode}, 8, '0') else ${workshop.courseCode} end`;
