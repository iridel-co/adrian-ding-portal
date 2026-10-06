import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { auditColumns } from "./columns";

/* An image stored in Cloudflare R2. */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt").default("").notNull(),
    archivedAt: timestamp("archived_at"),
    ...auditColumns()
  },
  (table) => [index("media_createdAt_idx").on(table.createdAt)]
);
