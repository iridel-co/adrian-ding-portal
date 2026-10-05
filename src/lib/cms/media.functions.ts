import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { media } from "@/db/schema";
import { authMiddleware } from "@/lib/auth.functions";
import { createdByValues, logActivity, updatedByValues } from "@/lib/cms/audit";
import { CmsValidationError } from "@/lib/cms/errors";
import { findMediaUsages } from "@/lib/cms/media-usage";
import {
  getMediaFileProblem,
  MEDIA_CONTENT_TYPES,
  MEDIA_EXTENSION_BY_TYPE
} from "@/lib/cms/media-rules";
import { createUploadUrl, headObject, publicMediaUrl } from "@/lib/cms/r2";

const ENTITY_TYPE = "media";

const uploadRequestInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(MEDIA_CONTENT_TYPES),
  sizeBytes: z.number().int().positive()
});

const uploadConfirmInput = z.object({
  key: z.string().startsWith("media/"),
  fileName: z.string().trim().min(1).max(255),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  alt: z.string().trim().max(500)
});

const listInput = z.object({
  search: z.string().trim().default(""),
  includeArchived: z.boolean().default(false)
});

const idInput = z.object({
  id: z.uuid()
});

const altInput = z.object({
  id: z.uuid(),
  alt: z.string().trim().max(500)
});

function makeMediaKey(contentType: keyof typeof MEDIA_EXTENSION_BY_TYPE) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = MEDIA_EXTENSION_BY_TYPE[contentType];

  return `media/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

export const $requestMediaUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadRequestInput)
  .handler(async ({ data }) => {
    const problem = getMediaFileProblem({ type: data.contentType, size: data.sizeBytes });
    if (problem) throw new CmsValidationError(problem);

    const key = makeMediaKey(data.contentType);
    const uploadUrl = await createUploadUrl(key, data.contentType);

    return { key, uploadUrl };
  });

export const $confirmMediaUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadConfirmInput)
  .handler(async ({ data, context }) => {
    const stored = await headObject(data.key);
    if (!stored) {
      throw new CmsValidationError("The upload did not reach storage. Try again.");
    }

    const problem = getMediaFileProblem({ type: stored.contentType, size: stored.sizeBytes });
    if (problem) throw new CmsValidationError(problem);

    return getDb().transaction(async (tx) => {
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
          ...createdByValues(context.user.id)
        })
        .returning();

      await logActivity(tx, {
        userId: context.user.id,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: row.id
      });

      return { ...row, url: publicMediaUrl(row.key) };
    });
  });

export const $listMedia = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(async ({ data }) => {
    const db = getDb();
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
  });

export const $updateMediaAlt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(altInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(media).where(eq(media.id, data.id));
      if (!before) throw new CmsValidationError("This image no longer exists.");

      await tx
        .update(media)
        .set({ alt: data.alt, ...updatedByValues(context.user.id) })
        .where(eq(media.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "update",
        entityType: ENTITY_TYPE,
        entityId: data.id,
        changes: { alt: { from: before.alt, to: data.alt } }
      });
    });
  });

export const $archiveMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      const usages = (await findMediaUsages(tx, [data.id])).get(data.id) ?? [];
      if (usages.length > 0) {
        const names = usages.map((usage) => usage.label).join(", ");
        throw new CmsValidationError(`This image is still used by: ${names}.`);
      }

      await tx
        .update(media)
        .set({ archivedAt: new Date(), ...updatedByValues(context.user.id) })
        .where(eq(media.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "archive",
        entityType: ENTITY_TYPE,
        entityId: data.id
      });
    });
  });

export const $restoreMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      await tx
        .update(media)
        .set({ archivedAt: null, ...updatedByValues(context.user.id) })
        .where(eq(media.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "restore",
        entityType: ENTITY_TYPE,
        entityId: data.id
      });
    });
  });

export type MediaItem = Awaited<ReturnType<typeof $listMedia>>[number];

export const mediaListQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["media", input],
    queryFn: () => $listMedia({ data: input })
  });
