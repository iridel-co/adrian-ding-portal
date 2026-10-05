import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  contentStatus,
  media,
  taxonomyTerm,
  user,
  workshop,
  workshopSession,
  workshopTag
} from "@/db/schema";
import { authMiddleware } from "@/lib/auth.functions";
import { createdByValues, diffChanges, logActivity, updatedByValues } from "@/lib/cms/audit";
import {
  assertContentTransition,
  type ContentStatus,
  contentStatusAction
} from "@/lib/cms/content-status";
import { isCourseCodeLocked } from "@/lib/cms/course-code-lock";
import type { DbOrTx } from "@/lib/cms/db-types";
import { CmsValidationError } from "@/lib/cms/errors";
import { assertPublishable } from "@/lib/cms/publish";
import { publicMediaUrl } from "@/lib/cms/r2";
import { assertSlugAvailable, slugify } from "@/lib/cms/slug";
import { manilaToday } from "@/lib/cms/time";
import {
  WORKSHOP_FIELD_LABELS,
  workshopPublishSchema,
  workshopSaveSchema
} from "@/lib/cms/workshop-schemas";

const ENTITY_TYPE = "workshop";

const ACTIVE_SESSION_STATUSES = ["open", "closed"] as const;

const statusFilterSchema = z.enum(["active", ...contentStatus.enumValues]);

const listInput = z.object({
  status: statusFilterSchema.default("active"),
  search: z.string().trim().default("")
});

const idInput = z.object({
  id: z.uuid()
});

const createInput = z.object({
  title: z.string().trim().min(1, "Enter a title.")
});

const updateInput = z.object({
  id: z.uuid(),
  values: workshopSaveSchema
});

const statusInput = z.object({
  id: z.uuid(),
  status: z.enum(contentStatus.enumValues)
});

function statusCondition(filter: z.infer<typeof statusFilterSchema>) {
  if (filter === "active") return ne(workshop.status, "archived");
  return eq(workshop.status, filter);
}

async function getWorkshopRow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(workshop).where(eq(workshop.id, id));
  if (!row) throw new CmsValidationError("This workshop no longer exists.");
  return row;
}

async function getTagIds(db: DbOrTx, workshopId: string) {
  const rows = await db
    .select({ termId: workshopTag.termId })
    .from(workshopTag)
    .where(eq(workshopTag.workshopId, workshopId))
    .orderBy(asc(workshopTag.position));

  return rows.map((row) => row.termId);
}

async function findUpcomingActiveSessions(db: DbOrTx, workshopId: string) {
  return db
    .select({ id: workshopSession.id, date: workshopSession.date })
    .from(workshopSession)
    .where(
      and(
        eq(workshopSession.workshopId, workshopId),
        inArray(workshopSession.status, ACTIVE_SESSION_STATUSES),
        gte(workshopSession.endDate, manilaToday())
      )
    )
    .orderBy(asc(workshopSession.date));
}

async function makeUniqueSlug(db: DbOrTx, title: string) {
  const base = slugify(title) || "workshop";
  const taken = await db
    .select({ slug: workshop.slug })
    .from(workshop)
    .where(or(eq(workshop.slug, base), ilike(workshop.slug, `${base}-%`)));
  const takenSlugs = new Set(taken.map((row) => row.slug));

  let slug = base;
  for (let suffix = 2; takenSlugs.has(slug); suffix++) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

async function assertCourseCodeFree(db: DbOrTx, courseCode: string | null, workshopId: string) {
  if (!courseCode) return;

  const [existing] = await db
    .select({ title: workshop.title })
    .from(workshop)
    .where(and(eq(workshop.courseCode, courseCode), ne(workshop.id, workshopId)))
    .limit(1);

  if (existing) {
    throw new CmsValidationError(
      `Course code ${courseCode} is already used by "${existing.title}".`
    );
  }
}

export const $listWorkshops = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(async ({ data }) => {
    const db = getDb();
    const today = manilaToday();

    const nextSessionDate = db
      .select({
        workshopId: workshopSession.workshopId,
        date: sql<string>`min(${workshopSession.date})`.as("next_date")
      })
      .from(workshopSession)
      .where(and(eq(workshopSession.status, "open"), gte(workshopSession.endDate, today)))
      .groupBy(workshopSession.workshopId)
      .as("next_session");

    const rows = await db
      .select({
        id: workshop.id,
        title: workshop.title,
        courseCode: workshop.courseCode,
        status: workshop.status,
        updatedAt: workshop.updatedAt,
        nextSessionDate: nextSessionDate.date
      })
      .from(workshop)
      .leftJoin(nextSessionDate, eq(nextSessionDate.workshopId, workshop.id))
      .where(
        and(
          statusCondition(data.status),
          data.search ? ilike(workshop.title, `%${data.search}%`) : undefined
        )
      )
      .orderBy(desc(workshop.updatedAt));

    const tagRows = await db
      .select({ workshopId: workshopTag.workshopId, name: taxonomyTerm.name })
      .from(workshopTag)
      .innerJoin(taxonomyTerm, eq(taxonomyTerm.id, workshopTag.termId))
      .where(
        inArray(
          workshopTag.workshopId,
          rows.map((row) => row.id)
        )
      )
      .orderBy(asc(workshopTag.position));

    return rows.map((row) => ({
      ...row,
      tags: tagRows.filter((tag) => tag.workshopId === row.id).map((tag) => tag.name)
    }));
  });

export const $getWorkshop = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ data }) => {
    const db = getDb();
    const row = await getWorkshopRow(db, data.id);

    const [heroMedia] = row.heroMediaId
      ? await db.select().from(media).where(eq(media.id, row.heroMediaId))
      : [];

    const tags = await db
      .select({
        id: taxonomyTerm.id,
        name: taxonomyTerm.name,
        archivedAt: taxonomyTerm.archivedAt
      })
      .from(workshopTag)
      .innerJoin(taxonomyTerm, eq(taxonomyTerm.id, workshopTag.termId))
      .where(eq(workshopTag.workshopId, data.id))
      .orderBy(asc(workshopTag.position));

    const upcomingSessions = await db
      .select({
        id: workshopSession.id,
        date: workshopSession.date,
        endDate: workshopSession.endDate,
        startTime: workshopSession.startTime,
        venueName: workshopSession.venueName,
        status: workshopSession.status
      })
      .from(workshopSession)
      .where(
        and(eq(workshopSession.workshopId, data.id), gte(workshopSession.endDate, manilaToday()))
      )
      .orderBy(asc(workshopSession.date));

    const [editor] = row.updatedBy
      ? await db.select({ name: user.name }).from(user).where(eq(user.id, row.updatedBy))
      : [];

    return {
      workshop: row,
      heroMedia: heroMedia
        ? { id: heroMedia.id, url: publicMediaUrl(heroMedia.key), alt: heroMedia.alt }
        : null,
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        isArchived: tag.archivedAt !== null
      })),
      upcomingSessions,
      updatedByName: editor?.name ?? null
    };
  });

export const $createWorkshop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(async ({ data, context }) => {
    return getDb().transaction(async (tx) => {
      const slug = await makeUniqueSlug(tx, data.title);

      const [row] = await tx
        .insert(workshop)
        .values({ title: data.title, slug, ...createdByValues(context.user.id) })
        .returning({ id: workshop.id });

      await logActivity(tx, {
        userId: context.user.id,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: row.id,
        changes: { title: { from: null, to: data.title } }
      });

      return row;
    });
  });

export const $updateWorkshop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateInput)
  .handler(async ({ data, context }) => {
    const { tagIds, ...values } = data.values;

    await getDb().transaction(async (tx) => {
      const before = await getWorkshopRow(tx, data.id);

      await assertSlugAvailable(tx, {
        table: workshop,
        idColumn: workshop.id,
        slugColumn: workshop.slug,
        slug: values.slug,
        excludeId: data.id
      });
      await assertCourseCodeFree(tx, values.courseCode, data.id);

      const isCourseCodeChanged = values.courseCode !== before.courseCode;
      if (isCourseCodeChanged && (await isCourseCodeLocked(tx, data.id))) {
        throw new CmsValidationError(
          "The course code is locked because this workshop has active registrations."
        );
      }

      const beforeTagIds = await getTagIds(tx, data.id);
      if (before.status === "published") {
        assertPublishable(workshopPublishSchema, { ...values, tagIds }, WORKSHOP_FIELD_LABELS);
      }

      await tx
        .update(workshop)
        .set({ ...values, ...updatedByValues(context.user.id) })
        .where(eq(workshop.id, data.id));

      await tx.delete(workshopTag).where(eq(workshopTag.workshopId, data.id));
      if (tagIds.length > 0) {
        await tx
          .insert(workshopTag)
          .values(tagIds.map((termId, position) => ({ workshopId: data.id, termId, position })));
      }

      const changes = diffChanges({ ...before, tagIds: beforeTagIds }, { ...values, tagIds });
      if (Object.keys(changes).length > 0) {
        await logActivity(tx, {
          userId: context.user.id,
          action: "update",
          entityType: ENTITY_TYPE,
          entityId: data.id,
          changes
        });
      }
    });
  });

export const $setWorkshopStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      const before = await getWorkshopRow(tx, data.id);
      const from: ContentStatus = before.status;
      assertContentTransition(from, data.status);

      if (data.status === "published") {
        const tagIds = await getTagIds(tx, data.id);
        assertPublishable(workshopPublishSchema, { ...before, tagIds }, WORKSHOP_FIELD_LABELS);
      }

      if (data.status !== "published") {
        const [session] = await findUpcomingActiveSessions(tx, data.id);
        if (session) {
          throw new CmsValidationError(
            `This workshop has an upcoming session on ${session.date}. Cancel that session first.`
          );
        }
      }

      await tx
        .update(workshop)
        .set({ status: data.status, ...updatedByValues(context.user.id) })
        .where(eq(workshop.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: contentStatusAction(from, data.status),
        entityType: ENTITY_TYPE,
        entityId: data.id,
        changes: { status: { from, to: data.status } }
      });
    });
  });

export type WorkshopListItem = Awaited<ReturnType<typeof $listWorkshops>>[number];

export type WorkshopDetail = Awaited<ReturnType<typeof $getWorkshop>>;

export const workshopsQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["workshops", "list", input],
    queryFn: () => $listWorkshops({ data: input })
  });

export const workshopQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["workshops", "detail", id],
    queryFn: () => $getWorkshop({ data: { id } })
  });
