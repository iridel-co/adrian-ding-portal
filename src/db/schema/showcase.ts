import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { auditColumns, position, status, stringList } from "./columns";
import { media } from "./media";
import { taxonomyTerm } from "./taxonomy";
import { workshop } from "./workshops";

/* A corporate training program run in-house for a company. */
export const inhouseProgram = pgTable("inhouse_program", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").default("").notNull(),
  imageMediaId: uuid("image_media_id").references(() => media.id, { onDelete: "restrict" }),
  usefulFor: stringList("useful_for"),
  position: position(),
  status: status(),
  ...auditColumns()
});

export const testimonial = pgTable("testimonial", {
  id: uuid("id").primaryKey().defaultRandom(),
  quote: text("quote").default("").notNull(),
  personName: text("person_name").notNull(),
  photoMediaId: uuid("photo_media_id").references(() => media.id, { onDelete: "restrict" }),
  role: text("role").default("").notNull(),
  company: text("company").default("").notNull(),
  workshopId: uuid("workshop_id").references(() => workshop.id, { onDelete: "set null" }),
  isFeatured: boolean("is_featured").default(false).notNull(),
  position: position(),
  status: status(),
  ...auditColumns()
});

/* A company on the client logo wall. */
export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoMediaId: uuid("logo_media_id").references(() => media.id, { onDelete: "restrict" }),
  industryTermId: uuid("industry_term_id").references(() => taxonomyTerm.id, {
    onDelete: "restrict"
  }),
  isFeatured: boolean("is_featured").default(false).notNull(),
  position: position(),
  status: status(),
  ...auditColumns()
});
