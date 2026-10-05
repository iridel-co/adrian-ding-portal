import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

import { auditColumns, position, status, stringList } from "./columns";
import { media } from "./media";
import { taxonomyTerm } from "./taxonomy";

export const sessionStatus = pgEnum("session_status", ["draft", "open", "closed", "cancelled"]);

/* The reusable content of a public workshop. Dated runs live in workshop_session. */
export const workshop = pgTable(
  "workshop",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    courseCode: text("course_code").unique(),
    title: text("title").notNull(),
    summary: text("summary").default("").notNull(),
    problem: text("problem").default("").notNull(),
    intro: text("intro").default("").notNull(),
    audience: text("audience").default("").notNull(),
    format: text("format").default("").notNull(),
    heroMediaId: uuid("hero_media_id").references(() => media.id, { onDelete: "restrict" }),
    primerVideoUrl: text("primer_video_url"),
    primerBlurb: text("primer_blurb").default("").notNull(),
    defaultVenueName: text("default_venue_name").default("").notNull(),
    defaultCity: text("default_city").default("").notNull(),
    defaultVenueMapUrl: text("default_venue_map_url"),
    defaultPriceCentavos: integer("default_price_centavos"),
    defaultPriceNote: text("default_price_note").default("").notNull(),
    defaultCapacity: integer("default_capacity"),
    outcomes: stringList("outcomes"),
    curriculum: stringList("curriculum"),
    inclusions: stringList("inclusions"),
    whatToExpect: stringList("what_to_expect"),
    status: status(),
    ...auditColumns()
  },
  (table) => [check("workshop_course_code_format", sql`${table.courseCode} ~ '^[A-Z0-9]{2,8}$'`)]
);

export const workshopTag = pgTable(
  "workshop_tag",
  {
    workshopId: uuid("workshop_id")
      .notNull()
      .references(() => workshop.id, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => taxonomyTerm.id, { onDelete: "restrict" }),
    position: position()
  },
  (table) => [
    primaryKey({ columns: [table.workshopId, table.termId] }),
    index("workshop_tag_termId_idx").on(table.termId)
  ]
);

/*
  One run of a workshop, on one day or on consecutive days (date to end_date).
  The same start and end times apply to each day, in Asia/Manila wall-clock time.
  Past is computed from end_date.
*/
export const workshopSession = pgTable(
  "workshop_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workshopId: uuid("workshop_id")
      .notNull()
      .references(() => workshop.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    endDate: date("end_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    venueName: text("venue_name").default("").notNull(),
    city: text("city").default("").notNull(),
    venueMapUrl: text("venue_map_url"),
    registrationCutoffAt: timestamp("registration_cutoff_at", { withTimezone: true }),
    priceCentavos: integer("price_centavos").notNull(),
    priceNote: text("price_note").default("").notNull(),
    capacity: integer("capacity").notNull(),
    status: sessionStatus("status").default("draft").notNull(),
    ...auditColumns()
  },
  (table) => [
    index("workshop_session_workshopId_idx").on(table.workshopId),
    index("workshop_session_date_idx").on(table.date),
    index("workshop_session_endDate_idx").on(table.endDate),
    check("workshop_session_date_order", sql`${table.endDate} >= ${table.date}`),
    check("workshop_session_time_order", sql`${table.endTime} > ${table.startTime}`),
    check("workshop_session_capacity_positive", sql`${table.capacity} >= 1`),
    check("workshop_session_price_non_negative", sql`${table.priceCentavos} >= 0`)
  ]
);
