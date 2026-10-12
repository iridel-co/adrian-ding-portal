import "@tanstack/react-start/server-only";
import { asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { inhouseProgram, media, user } from "@/db/schema";
import {
  type createInput,
  type idInput,
  type listInput,
  PROGRAM_FIELD_LABELS,
  programPublishSchema,
  type reorderInput,
  type statusFilterSchema,
  type statusInput,
  type updateInput
} from "@/features/corporate-trainings/schemas";
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
import { nextPosition, reorder } from "@/features/shared/ordering";
import { assertPublishable } from "@/features/shared/publish";
import { assertSlugAvailable, makeUniqueSlug } from "@/features/shared/slug";

const ENTITY_TYPE = "inhouse_program";

const orderedScope = ne(inhouseProgram.status, "archived");

const orderedTable = {
  table: inhouseProgram,
  idColumn: inhouseProgram.id,
  positionColumn: inhouseProgram.position,
  scope: orderedScope
};

function statusCondition(filter: z.infer<typeof statusFilterSchema>) {
  if (filter === "active") return orderedScope;
  return eq(inhouseProgram.status, filter);
}

async function getProgramRow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(inhouseProgram).where(eq(inhouseProgram.id, id));
  if (!row) throw new CmsValidationError("This program no longer exists.");
  return row;
}

export async function listPrograms(db: DbOrTx, data: z.infer<typeof listInput>) {
  return db
    .select({
      id: inhouseProgram.id,
      title: inhouseProgram.title,
      status: inhouseProgram.status,
      position: inhouseProgram.position,
      updatedAt: inhouseProgram.updatedAt
    })
    .from(inhouseProgram)
    .where(statusCondition(data.status))
    .orderBy(asc(inhouseProgram.position), asc(inhouseProgram.createdAt));
}

async function listPublishedCards(db: DbOrTx) {
  const rows = await db
    .select({
      id: inhouseProgram.id,
      title: inhouseProgram.title,
      slug: inhouseProgram.slug,
      summary: inhouseProgram.summary,
      usefulFor: inhouseProgram.usefulFor,
      imageKey: media.key,
      imageAlt: media.alt
    })
    .from(inhouseProgram)
    .leftJoin(media, eq(media.id, inhouseProgram.imageMediaId))
    .where(eq(inhouseProgram.status, "published"))
    .orderBy(asc(inhouseProgram.position), asc(inhouseProgram.createdAt));

  return rows.map(({ imageKey, imageAlt, ...row }) => ({
    ...row,
    image: imageKey ? { url: publicMediaUrl(imageKey), alt: imageAlt ?? "" } : null
  }));
}

export async function getProgram(db: DbOrTx, data: z.infer<typeof idInput>) {
  const row = await getProgramRow(db, data.id);

  const [image] = row.imageMediaId
    ? await db.select().from(media).where(eq(media.id, row.imageMediaId))
    : [];

  const [editor] = row.updatedBy
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, row.updatedBy))
    : [];

  return {
    program: row,
    image: image ? { id: image.id, url: publicMediaUrl(image.key), alt: image.alt } : null,
    publishedCards: await listPublishedCards(db),
    updatedByName: editor?.name ?? null
  };
}

export async function createProgram(db: DbOrTx, actor: Actor, data: z.infer<typeof createInput>) {
  return db.transaction(async (tx) => {
    const slug = await makeUniqueSlug(tx, {
      table: inhouseProgram,
      slugColumn: inhouseProgram.slug,
      title: data.title,
      fallback: "program"
    });
    const position = await nextPosition(tx, orderedTable);

    const [row] = await tx
      .insert(inhouseProgram)
      .values({
        title: data.title,
        slug,
        position,
        ...createdByValues(actor.id)
      })
      .returning({ id: inhouseProgram.id });

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

export async function updateProgram(db: DbOrTx, actor: Actor, data: z.infer<typeof updateInput>) {
  const { values } = data;

  await db.transaction(async (tx) => {
    const before = await getProgramRow(tx, data.id);

    await assertSlugAvailable(tx, {
      table: inhouseProgram,
      idColumn: inhouseProgram.id,
      slugColumn: inhouseProgram.slug,
      slug: values.slug,
      excludeId: data.id
    });

    if (before.status === "published") {
      assertPublishable(programPublishSchema, values, PROGRAM_FIELD_LABELS);
    }

    await tx
      .update(inhouseProgram)
      .set({ ...values, ...updatedByValues(actor.id) })
      .where(eq(inhouseProgram.id, data.id));

    const changes = diffChanges(before, values);
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

export async function setProgramStatus(
  db: DbOrTx,
  actor: Actor,
  data: z.infer<typeof statusInput>
) {
  await db.transaction(async (tx) => {
    const before = await getProgramRow(tx, data.id);
    const from: ContentStatus = before.status;
    assertContentTransition(from, data.status);

    if (data.status === "published") {
      assertPublishable(programPublishSchema, before, PROGRAM_FIELD_LABELS);
    }

    const isRestore = from === "archived";
    const position = isRestore ? await nextPosition(tx, orderedTable) : before.position;

    await tx
      .update(inhouseProgram)
      .set({ status: data.status, position, ...updatedByValues(actor.id) })
      .where(eq(inhouseProgram.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: contentStatusAction(from, data.status),
      entityType: ENTITY_TYPE,
      entityId: data.id,
      changes: { status: { from, to: data.status } }
    });
  });
}

export async function reorderPrograms(
  db: DbOrTx,
  actor: Actor,
  data: z.infer<typeof reorderInput>
) {
  await db.transaction(async (tx) => {
    await reorder(tx, orderedTable, data.ids);

    await logActivity(tx, {
      userId: actor.id,
      action: "reorder",
      entityType: ENTITY_TYPE,
      entityId: ENTITY_TYPE,
      changes: { order: { from: null, to: data.ids } }
    });
  });
}
