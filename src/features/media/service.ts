import "@tanstack/react-start/server-only";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { media } from "@/db/schema";
import { createUploadUrl, headObject, publicMediaUrl } from "@/features/media/r2";
import { getMediaFileProblem, MEDIA_EXTENSION_BY_TYPE } from "@/features/media/rules";
import type {
  altInput,
  idInput,
  listInput,
  uploadConfirmInput,
  uploadRequestInput
} from "@/features/media/schemas";
import { findMediaUsages } from "@/features/media/usage";
import type { Actor } from "@/features/shared/actor";
import { createdByValues, logActivity, updatedByValues } from "@/features/shared/audit";
import type { DbOrTx } from "@/features/shared/db-types";
import { CmsValidationError } from "@/features/shared/errors";

const ENTITY_TYPE = "media";

function makeMediaKey(contentType: keyof typeof MEDIA_EXTENSION_BY_TYPE) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = MEDIA_EXTENSION_BY_TYPE[contentType];

  return `media/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

export async function requestMediaUpload(data: z.infer<typeof uploadRequestInput>) {
  const problem = getMediaFileProblem({ type: data.contentType, size: data.sizeBytes });
  if (problem) throw new CmsValidationError(problem);

  const key = makeMediaKey(data.contentType);
  const uploadUrl = await createUploadUrl(key, data.contentType);

  return { key, uploadUrl };
}

export async function confirmMediaUpload(
  db: DbOrTx,
  actor: Actor,
  data: z.infer<typeof uploadConfirmInput>
) {
  const stored = await headObject(data.key);
  if (!stored) {
    throw new CmsValidationError("The upload did not reach storage. Try again.");
  }

  const problem = getMediaFileProblem({ type: stored.contentType, size: stored.sizeBytes });
  if (problem) throw new CmsValidationError(problem);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(media)
      .values({
        key: data.key,
        fileName: data.fileName,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
        width: data.width,
        height: data.height,
        alt: data.alt,
        ...createdByValues(actor.id)
      })
      .returning();

    await logActivity(tx, {
      userId: actor.id,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: row.id
    });

    return { ...row, url: publicMediaUrl(row.key) };
  });
}

export async function listMedia(db: DbOrTx, data: z.infer<typeof listInput>) {
  const searchPattern = `%${data.search}%`;

  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        data.includeArchived ? undefined : isNull(media.archivedAt),
        data.search
          ? or(ilike(media.fileName, searchPattern), ilike(media.alt, searchPattern))
          : undefined
      )
    )
    .orderBy(desc(media.createdAt));

  const usages = await findMediaUsages(
    db,
    rows.map((row) => row.id)
  );

  return rows.map((row) => ({
    ...row,
    url: publicMediaUrl(row.key),
    usages: usages.get(row.id) ?? []
  }));
}

export async function updateMediaAlt(db: DbOrTx, actor: Actor, data: z.infer<typeof altInput>) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(media).where(eq(media.id, data.id));
    if (!before) throw new CmsValidationError("This image no longer exists.");

    await tx
      .update(media)
      .set({ alt: data.alt, ...updatedByValues(actor.id) })
      .where(eq(media.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: data.id,
      changes: { alt: { from: before.alt, to: data.alt } }
    });
  });
}

export async function archiveMedia(db: DbOrTx, actor: Actor, data: z.infer<typeof idInput>) {
  await db.transaction(async (tx) => {
    const usages = (await findMediaUsages(tx, [data.id])).get(data.id) ?? [];
    if (usages.length > 0) {
      const names = usages.map((usage) => usage.label).join(", ");
      throw new CmsValidationError(`This image is still used by: ${names}.`);
    }

    await tx
      .update(media)
      .set({ archivedAt: new Date(), ...updatedByValues(actor.id) })
      .where(eq(media.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "archive",
      entityType: ENTITY_TYPE,
      entityId: data.id
    });
  });
}

export async function restoreMedia(db: DbOrTx, actor: Actor, data: z.infer<typeof idInput>) {
  await db.transaction(async (tx) => {
    await tx
      .update(media)
      .set({ archivedAt: null, ...updatedByValues(actor.id) })
      .where(eq(media.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "restore",
      entityType: ENTITY_TYPE,
      entityId: data.id
    });
  });
}
