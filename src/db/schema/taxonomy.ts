import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { auditColumns, position } from "./columns";

export const taxonomyKind = pgEnum("taxonomy_kind", ["workshop_tag", "client_industry"]);

/* Managed lists: workshop tags and client industries. */
export const taxonomyTerm = pgTable(
  "taxonomy_term",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: taxonomyKind("kind").notNull(),
    name: text("name").notNull(),
    position: position(),
    archivedAt: timestamp("archived_at"),
    ...auditColumns()
  },
  (table) => [
    uniqueIndex("taxonomy_term_kind_name_active_idx")
      .on(table.kind, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`)
  ]
);
