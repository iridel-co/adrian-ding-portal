import { integer, jsonb, pgEnum, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const contentStatus = pgEnum("content_status", ["draft", "published", "archived"]);

/* Who created and last changed a content row, and when. */
export function auditColumns() {
  return {
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  };
}

export function stringList(name: string) {
  return jsonb(name).$type<string[]>().default([]).notNull();
}

export function position() {
  return integer("position").default(0).notNull();
}

export function status() {
  return contentStatus("status").default("draft").notNull();
}
