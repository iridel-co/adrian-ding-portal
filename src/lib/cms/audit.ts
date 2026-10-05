import { activityLog, type FieldChange } from "@/db/schema";
import type { DbOrTx } from "@/lib/cms/db-types";

type ActivityAction = (typeof activityLog.$inferInsert)["action"];

type ActivityEntry = {
  userId: string;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  changes?: Record<string, FieldChange>;
};

export function createdByValues(userId: string) {
  return {
    createdBy: userId,
    updatedBy: userId
  };
}

export function updatedByValues(userId: string) {
  return {
    updatedBy: userId
  };
}

/* Fields in `after` whose value differs from `before`, with both values. */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, FieldChange> = {};

  for (const [field, to] of Object.entries(after)) {
    const from = before[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[field] = { from, to };
    }
  }

  return changes;
}

export async function logActivity(db: DbOrTx, entry: ActivityEntry) {
  await db.insert(activityLog).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes ?? {}
  });
}
