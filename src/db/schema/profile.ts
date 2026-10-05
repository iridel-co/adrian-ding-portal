import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { auditColumns, stringList } from "./columns";
import { media } from "./media";

export type SocialNetwork = "linkedin" | "facebook" | "instagram" | "tiktok" | "youtube";

export type SocialLink = {
  network: SocialNetwork;
  url: string;
};

export type ProfileStat = {
  value: string;
  label: string;
  description?: string;
};

export type TimelineEntry = {
  period: string;
  title: string;
  description: string;
  mediaId?: string;
};

export type Credential = {
  organization: string;
  description: string;
  logoMediaId?: string;
};

export const SITE_PROFILE_ID = "main";

/* The single row that holds the bio, contact details, stats, timeline and credentials. */
export const siteProfile = pgTable(
  "site_profile",
  {
    id: text("id").primaryKey().default(SITE_PROFILE_ID),
    headline: text("headline").default("").notNull(),
    shortBio: text("short_bio").default("").notNull(),
    longBio: stringList("long_bio"),
    portraitMediaId: uuid("portrait_media_id").references(() => media.id, {
      onDelete: "restrict"
    }),
    emails: stringList("emails"),
    phone: text("phone").default("").notNull(),
    socialLinks: jsonb("social_links").$type<SocialLink[]>().default([]).notNull(),
    stats: jsonb("stats").$type<ProfileStat[]>().default([]).notNull(),
    timeline: jsonb("timeline").$type<TimelineEntry[]>().default([]).notNull(),
    credentials: jsonb("credentials").$type<Credential[]>().default([]).notNull(),
    ...auditColumns()
  },
  (table) => [check("site_profile_singleton", sql`${table.id} = 'main'`)]
);
