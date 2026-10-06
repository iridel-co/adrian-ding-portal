import "@tanstack/react-start/server-only";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { taxonomyTerm } from "@/db/schema";
import type { Actor } from "@/features/shared/actor";
import { createdByValues, logActivity, updatedByValues } from "@/features/shared/audit";
import type { DbOrTx } from "@/features/shared/db-types";
import { CmsValidationError } from "@/features/shared/errors";
import { nextPosition, reorder } from "@/features/shared/ordering";
import type {
  createInput,
  idInput,
  listInput,
  renameInput,
  reorderInput,
  TaxonomyKind
} from "@/features/taxonomy/schemas";

const ENTITY_TYPE = "taxonomy_term";

function activeScope(kind: TaxonomyKind) {
  return and(eq(taxonomyTerm.kind, kind), isNull(taxonomyTerm.archivedAt));
}

async function assertNameFree(db: DbOrTx, kind: TaxonomyKind, name: string, excludeId?: string) {
  const [existing] = await db
    .select({ id: taxonomyTerm.id })
    .from(taxonomyTerm)
    .where(
      and(
        activeScope(kind),
        sql`lower(${taxonomyTerm.name}) = lower(${name})`,
        excludeId ? ne(taxonomyTerm.id, excludeId) : undefined
      )
    )
    .limit(1);

  if (existing) throw new CmsValidationError(`"${name}" already exists.`);
}

async function getTerm(db: DbOrTx, id: string) {
  const [term] = await db.select().from(taxonomyTerm).where(eq(taxonomyTerm.id, id));
  if (!term) throw new CmsValidationError("This item no longer exists.");
  return term;
}

export async function listTerms(db: DbOrTx, data: z.infer<typeof listInput>) {
  return db
    .select()
    .from(taxonomyTerm)
    .where(
      and(
        eq(taxonomyTerm.kind, data.kind),
        data.includeArchived ? undefined : isNull(taxonomyTerm.archivedAt)
      )
    )
    .orderBy(sql`${taxonomyTerm.archivedAt} is not null`, asc(taxonomyTerm.position));
}

export async function createTerm(db: DbOrTx, actor: Actor, data: z.infer<typeof createInput>) {
  return db.transaction(async (tx) => {
    await assertNameFree(tx, data.kind, data.name);

    const position = await nextPosition(tx, {
      table: taxonomyTerm,
      idColumn: taxonomyTerm.id,
      positionColumn: taxonomyTerm.position,
      scope: activeScope(data.kind)
    });

    const [term] = await tx
      .insert(taxonomyTerm)
      .values({
        kind: data.kind,
        name: data.name,
        position,
        ...createdByValues(actor.id)
      })
      .returning();

    await logActivity(tx, {
      userId: actor.id,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: term.id,
      changes: { name: { from: null, to: term.name } }
    });

    return term;
  });
}

export async function renameTerm(db: DbOrTx, actor: Actor, data: z.infer<typeof renameInput>) {
  await db.transaction(async (tx) => {
    const before = await getTerm(tx, data.id);
    if (before.name === data.name) return;

    await assertNameFree(tx, before.kind, data.name, data.id);

    await tx
      .update(taxonomyTerm)
      .set({ name: data.name, ...updatedByValues(actor.id) })
      .where(eq(taxonomyTerm.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: data.id,
      changes: { name: { from: before.name, to: data.name } }
    });
  });
}

export async function reorderTerms(db: DbOrTx, actor: Actor, data: z.infer<typeof reorderInput>) {
  await db.transaction(async (tx) => {
    await reorder(
      tx,
      {
        table: taxonomyTerm,
        idColumn: taxonomyTerm.id,
        positionColumn: taxonomyTerm.position,
        scope: activeScope(data.kind)
      },
      data.ids
    );

    await logActivity(tx, {
      userId: actor.id,
      action: "reorder",
      entityType: ENTITY_TYPE,
      entityId: data.kind,
      changes: { order: { from: null, to: data.ids } }
    });
  });
}

export async function archiveTerm(db: DbOrTx, actor: Actor, data: z.infer<typeof idInput>) {
  await db.transaction(async (tx) => {
    await getTerm(tx, data.id);

    await tx
      .update(taxonomyTerm)
      .set({ archivedAt: new Date(), ...updatedByValues(actor.id) })
      .where(eq(taxonomyTerm.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "archive",
      entityType: ENTITY_TYPE,
      entityId: data.id
    });
  });
}

export async function restoreTerm(db: DbOrTx, actor: Actor, data: z.infer<typeof idInput>) {
  await db.transaction(async (tx) => {
    const term = await getTerm(tx, data.id);
    await assertNameFree(tx, term.kind, term.name, term.id);

    const position = await nextPosition(tx, {
      table: taxonomyTerm,
      idColumn: taxonomyTerm.id,
      positionColumn: taxonomyTerm.position,
      scope: activeScope(term.kind)
    });

    await tx
      .update(taxonomyTerm)
      .set({ archivedAt: null, position, ...updatedByValues(actor.id) })
      .where(eq(taxonomyTerm.id, data.id));

    await logActivity(tx, {
      userId: actor.id,
      action: "restore",
      entityType: ENTITY_TYPE,
      entityId: data.id
    });
  });
}
