import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { media, taxonomyTerm, user, workshop, workshopSession, workshopTag } from "@/db/schema";
import { publicMediaUrl } from "@/features/media/r2";
import type { Actor } from "@/features/shared/actor";
import {
  createdByValues,
  diffChanges,
  logActivity,
  updatedByValues
} from "@/features/shared/audit";
import {
  assertContentTransition,
  type ContentStatus,
  contentStatusAction
} from "@/features/shared/content-status";
import type { DbOrTx } from "@/features/shared/db-types";
import { CmsValidationError } from "@/features/shared/errors";
import { assertPublishable } from "@/features/shared/publish";
import { assertSlugAvailable, slugify } from "@/features/shared/slug";
import { manilaToday } from "@/features/shared/time";
import { isCourseCodeLocked } from "@/features/workshops/course-code-lock";
import {
  type createInput,
  type idInput,
  type listInput,
  type statusFilterSchema,
  type statusInput,
  type updateInput,
  WORKSHOP_FIELD_LABELS,
  workshopPublishSchema
} from "@/features/workshops/schemas";

const ENTITY_TYPE = "workshop";

const ACTIVE_SESSION_STATUSES = ["open", "closed"] as const;

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

export async function listWorkshops(db: DbOrTx, data: z.infer<typeof listInput>) {
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
}

export async function getWorkshop(db: DbOrTx, data: z.infer<typeof idInput>) {
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
      endTime: workshopSession.endTime,
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
}

export async function createWorkshop(db: DbOrTx, actor: Actor, data: z.infer<typeof createInput>) {
  return db.transaction(async (tx) => {
    const slug = await makeUniqueSlug(tx, data.title);

    const [row] = await tx
      .insert(workshop)
      .values({ title: data.title, slug, ...createdByValues(actor.id) })
      .returning({ id: workshop.id });

    await logActivity(tx, {
      userId: actor.id,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: row.id,
      changes: { title: { from: null, to: data.title } }
    });

    return row;
  });
}

export async function updateWorkshop(db: DbOrTx, actor: Actor, data: z.infer<typeof updateInput>) {
  const { tagIds, ...values } = data.values;

  await db.transaction(async (tx) => {
    // Public intake holds this same lock before checking or creating a signup.
    await tx.select({ id: workshop.id }).from(workshop).where(eq(workshop.id, data.id)).for("update");
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
      .set({ ...values, ...updatedByValues(actor.id) })
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
        userId: actor.id,
        action: "update",
        entityType: ENTITY_TYPE,
        entityId: data.id,
        changes
      });
    }
  });
}

export async function setWorkshopStatus(
  db: DbOrTx,
  actor: Actor,
  data: z.infer<typeof statusInput>
) {
  await db.transaction(async (tx) => {
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
      .set({ status: data.status, ...updatedByValues(actor.id) })
      .where(eq(workshop.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: contentStatusAction(from, data.status),
      entityType: ENTITY_TYPE,
      entityId: data.id,
      changes: { status: { from, to: data.status } }
    });
  });
}
