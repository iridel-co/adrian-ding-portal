import { inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import {
  client,
  inhouseProgram,
  paymentAccount,
  siteProfile,
  testimonial,
  workshop
} from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";

export type MediaUsage = {
  entityType: string;
  entityId: string;
  label: string;
};

type MediaReference = {
  entityType: string;
  table: PgTable;
  idColumn: PgColumn;
  labelColumn: PgColumn;
  mediaColumn: PgColumn;
};

/* Every column that points at a media row. The media usage test checks this list is complete. */
export const MEDIA_REFERENCES: MediaReference[] = [
  {
    entityType: "workshop",
    table: workshop,
    idColumn: workshop.id,
    labelColumn: workshop.title,
    mediaColumn: workshop.heroMediaId
  },
  {
    entityType: "inhouse_program",
    table: inhouseProgram,
    idColumn: inhouseProgram.id,
    labelColumn: inhouseProgram.title,
    mediaColumn: inhouseProgram.imageMediaId
  },
  {
    entityType: "testimonial",
    table: testimonial,
    idColumn: testimonial.id,
    labelColumn: testimonial.personName,
    mediaColumn: testimonial.photoMediaId
  },
  {
    entityType: "client",
    table: client,
    idColumn: client.id,
    labelColumn: client.name,
    mediaColumn: client.logoMediaId
  },
  {
    entityType: "payment_account",
    table: paymentAccount,
    idColumn: paymentAccount.id,
    labelColumn: paymentAccount.providerName,
    mediaColumn: paymentAccount.qrMediaId
  },
  {
    entityType: "site_profile",
    table: siteProfile,
    idColumn: siteProfile.id,
    labelColumn: siteProfile.headline,
    mediaColumn: siteProfile.portraitMediaId
  }
];

const PROFILE_LABEL = "Profile";

function addUsage(usages: Map<string, MediaUsage[]>, mediaId: string, usage: MediaUsage) {
  const list = usages.get(mediaId) ?? [];
  list.push(usage);
  usages.set(mediaId, list);
}

async function findColumnUsages(db: DbOrTx, mediaIds: string[], usages: Map<string, MediaUsage[]>) {
  for (const reference of MEDIA_REFERENCES) {
    const rows = await db
      .select({
        mediaId: reference.mediaColumn,
        entityId: reference.idColumn,
        label: reference.labelColumn
      })
      .from(reference.table)
      .where(inArray(reference.mediaColumn, mediaIds));

    for (const row of rows) {
      const label = reference.entityType === "site_profile" ? PROFILE_LABEL : String(row.label);
      addUsage(usages, String(row.mediaId), {
        entityType: reference.entityType,
        entityId: String(row.entityId),
        label
      });
    }
  }
}

/* Timeline images and credential logos live inside the profile's jsonb lists. */
async function findProfileListUsages(
  db: DbOrTx,
  mediaIds: string[],
  usages: Map<string, MediaUsage[]>
) {
  const wanted = new Set(mediaIds);
  const profiles = await db
    .select({
      id: siteProfile.id,
      timeline: siteProfile.timeline,
      credentials: siteProfile.credentials
    })
    .from(siteProfile);

  for (const profile of profiles) {
    const listMediaIds = [
      ...profile.timeline.map((entry) => entry.mediaId),
      ...profile.credentials.map((credential) => credential.logoMediaId)
    ];

    for (const mediaId of listMediaIds) {
      if (!mediaId || !wanted.has(mediaId)) continue;
      addUsage(usages, mediaId, {
        entityType: "site_profile",
        entityId: profile.id,
        label: PROFILE_LABEL
      });
    }
  }
}

/* Content items that use each media id. Ids with no usage are absent from the map. */
export async function findMediaUsages(db: DbOrTx, mediaIds: string[]) {
  const usages = new Map<string, MediaUsage[]>();
  if (mediaIds.length === 0) return usages;

  await findColumnUsages(db, mediaIds, usages);
  await findProfileListUsages(db, mediaIds, usages);

  return usages;
}
