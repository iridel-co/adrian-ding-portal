import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { taxonomyKind, taxonomyTerm } from "@/db/schema";
import { authMiddleware } from "@/lib/auth.functions";
import { createdByValues, logActivity, updatedByValues } from "@/lib/cms/audit";
import type { DbOrTx } from "@/lib/cms/db-types";
import { CmsValidationError } from "@/lib/cms/errors";
import { nextPosition, reorder } from "@/lib/cms/ordering";

const ENTITY_TYPE = "taxonomy_term";

const kindSchema = z.enum(taxonomyKind.enumValues);

export type TaxonomyKind = z.infer<typeof kindSchema>;

const nameSchema = z.string().trim().min(1, "Enter a name.").max(80);

const listInput = z.object({
  kind: kindSchema,
  includeArchived: z.boolean().default(false)
});

const createInput = z.object({
  kind: kindSchema,
  name: nameSchema
});

const renameInput = z.object({
  id: z.uuid(),
  name: nameSchema
});

const reorderInput = z.object({
  kind: kindSchema,
  ids: z.array(z.uuid())
});

const idInput = z.object({
  id: z.uuid()
});

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

export const $listTerms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(async ({ data }) => {
    return getDb()
      .select()
      .from(taxonomyTerm)
      .where(
        and(
          eq(taxonomyTerm.kind, data.kind),
          data.includeArchived ? undefined : isNull(taxonomyTerm.archivedAt)
        )
      )
      .orderBy(sql`${taxonomyTerm.archivedAt} is not null`, asc(taxonomyTerm.position));
  });

export const $createTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(async ({ data, context }) => {
    return getDb().transaction(async (tx) => {
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
          ...createdByValues(context.user.id)
        })
        .returning();

      await logActivity(tx, {
        userId: context.user.id,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: term.id,
        changes: { name: { from: null, to: term.name } }
      });

      return term;
    });
  });

export const $renameTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(renameInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      const before = await getTerm(tx, data.id);
      if (before.name === data.name) return;

      await assertNameFree(tx, before.kind, data.name, data.id);

      await tx
        .update(taxonomyTerm)
        .set({ name: data.name, ...updatedByValues(context.user.id) })
        .where(eq(taxonomyTerm.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "update",
        entityType: ENTITY_TYPE,
        entityId: data.id,
        changes: { name: { from: before.name, to: data.name } }
      });
    });
  });

export const $reorderTerms = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reorderInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
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
        userId: context.user.id,
        action: "reorder",
        entityType: ENTITY_TYPE,
        entityId: data.kind,
        changes: { order: { from: null, to: data.ids } }
      });
    });
  });

export const $archiveTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      await getTerm(tx, data.id);

      await tx
        .update(taxonomyTerm)
        .set({ archivedAt: new Date(), ...updatedByValues(context.user.id) })
        .where(eq(taxonomyTerm.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "archive",
        entityType: ENTITY_TYPE,
        entityId: data.id
      });
    });
  });

export const $restoreTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
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
        .set({ archivedAt: null, position, ...updatedByValues(context.user.id) })
        .where(eq(taxonomyTerm.id, data.id));

      await logActivity(tx, {
        userId: context.user.id,
        action: "restore",
        entityType: ENTITY_TYPE,
        entityId: data.id
      });
    });
  });

export type TaxonomyTerm = Awaited<ReturnType<typeof $listTerms>>[number];

export const termsQueryOptions = (input: z.input<typeof listInput>) =>
  queryOptions({
    queryKey: ["taxonomy", input.kind, input],
    queryFn: () => $listTerms({ data: input })
  });
