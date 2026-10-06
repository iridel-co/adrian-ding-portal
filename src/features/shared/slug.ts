import { and, eq, ne, type SQL } from "drizzle-orm";
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
