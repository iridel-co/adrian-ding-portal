import { index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { auditColumns, position, status } from "./columns";

export const faqGroup = pgEnum("faq_group", ["workshop", "about"]);

export const faq = pgTable(
  "faq",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group: faqGroup("group").notNull(),
    question: text("question").notNull(),
    answer: text("answer").default("").notNull(),
    position: position(),
    status: status(),
    ...auditColumns()
  },
  (table) => [index("faq_group_idx").on(table.group)]
);
