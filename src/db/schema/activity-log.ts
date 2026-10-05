import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const activityAction = pgEnum("activity_action", [
  "create",
  "update",
  "status_change",
  "reorder",
  "archive",
  "restore"
]);

export type FieldChange = {
  from: unknown;
  to: unknown;
};

/* One entry for each change to a content row. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: activityAction("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    changes: jsonb("changes").$type<Record<string, FieldChange>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    index("activity_log_entity_idx").on(table.entityType, table.entityId),
    index("activity_log_createdAt_idx").on(table.createdAt)
  ]
);
