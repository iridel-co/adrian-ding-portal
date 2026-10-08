import "@tanstack/react-start/server-only";
import { and, eq, inArray } from "drizzle-orm";

import { media, SITE_PROFILE_ID, siteProfile, type StatPage } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { type PublicMedia, toPublicMedia } from "@/features/shared/public-api";
import { isNotArchived } from "@/features/shared/visibility";

type ProfileRow = typeof siteProfile.$inferSelect;

type MediaLookup = (id: string | null | undefined) => PublicMedia | null;

/* Every media id the profile points at, including the ones inside jsonb lists. */
export function profileMediaIds(row: ProfileRow) {
  const ids = [
    row.portraitMediaId,
    ...row.timeline.map((entry) => entry.mediaId),
    ...row.credentials.map((credential) => credential.logoMediaId)
  ];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export function toPublicProfile(
  row: ProfileRow | undefined,
  mediaFor: MediaLookup,
  statsPage?: StatPage
) {
  const stats = (row?.stats ?? []).filter((stat) => !statsPage || stat.pages.includes(statsPage));

  return {
    headline: row?.headline ?? "",
    tagline: row?.tagline ?? "",
    roles: row?.roles ?? [],
    shortBio: row?.shortBio ?? "",
    longBio: row?.longBio ?? [],
    portrait: mediaFor(row?.portraitMediaId),
    emails: row?.emails ?? [],
    phone: row?.phone ?? "",
    footerTopics: row?.footerTopics ?? [],
    socialLinks: row?.socialLinks ?? [],
    stats: stats.map((stat) => ({
      value: stat.value,
      label: stat.label,
      description: stat.description ?? "",
      pages: stat.pages
    })),
    timeline: (row?.timeline ?? []).map((entry) => ({
      period: entry.period,
      title: entry.title,
      description: entry.description,
      image: mediaFor(entry.mediaId)
    })),
    credentials: (row?.credentials ?? []).map((credential) => ({
      organization: credential.organization,
      description: credential.description,
      logo: mediaFor(credential.logoMediaId)
    })),
    corporatePrimer: {
      videoUrl: row?.corporatePrimerVideoUrl ?? null,
      blurb: row?.corporatePrimerBlurb ?? ""
    }
  };
}

export async function getPublicProfile(db: DbOrTx, filters: { statsPage?: StatPage }) {
  const [row] = await db.select().from(siteProfile).where(eq(siteProfile.id, SITE_PROFILE_ID));

  const ids = row ? profileMediaIds(row) : [];
  const mediaRows = ids.length
    ? await db
        .select()
        .from(media)
        .where(and(inArray(media.id, ids), isNotArchived(media.archivedAt)))
    : [];
  const mediaById = new Map(mediaRows.map((item) => [item.id, toPublicMedia(item)]));

  return toPublicProfile(row, (id) => (id ? (mediaById.get(id) ?? null) : null), filters.statsPage);
}
