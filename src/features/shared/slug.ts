import { and, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { DbOrTx } from "@/features/shared/db-types";
import { CmsValidationError } from "@/features/shared/errors";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlug(slug: string) {
  return SLUG_PATTERN.test(slug);
}

type SlugCheck = {
  table: PgTable;
  idColumn: PgColumn;
  slugColumn: PgColumn;
  slug: string;
  excludeId?: string;
};

export async function assertSlugAvailable(db: DbOrTx, check: SlugCheck) {
  if (!isValidSlug(check.slug)) {
    throw new CmsValidationError("Slug can only use lowercase letters, digits and hyphens.");
  }

  const conditions: SQL[] = [eq(check.slugColumn, check.slug)];
  if (check.excludeId) {
    conditions.push(ne(check.idColumn, check.excludeId));
  }

  const [existing] = await db
    .select({ id: check.idColumn })
    .from(check.table)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new CmsValidationError(`The slug "${check.slug}" is already in use.`);
  }
}

type UniqueSlugTarget = {
  table: PgTable;
  slugColumn: PgColumn;
  title: string;
  fallback: string;
};

/* A slug from the title, with a -2, -3 suffix when the base slug is taken. */
export async function makeUniqueSlug(db: DbOrTx, target: UniqueSlugTarget) {
  const base = slugify(target.title) || target.fallback;
  const taken = await db
    .select({ slug: target.slugColumn })
    .from(target.table)
    .where(or(eq(target.slugColumn, base), ilike(target.slugColumn, `${base}-%`)));
  const takenSlugs = new Set(taken.map((row) => String(row.slug)));

  let slug = base;
  for (let suffix = 2; takenSlugs.has(slug); suffix++) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}
