import { getTableName, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { DbOrTx } from "@/lib/cms/db-types";
import { CmsValidationError } from "@/lib/cms/errors";

type OrderedTable = {
  table: PgTable;
  idColumn: PgColumn;
  positionColumn: PgColumn;
  /* Limits the rows that share one order, e.g. one FAQ group. */
  scope?: SQL;
};

/*
  Call inside a transaction. The lock holds until the transaction ends, so two inserts
  into the same table never read the same max position.
*/
export async function nextPosition(db: DbOrTx, target: OrderedTable) {
  const tableName = getTableName(target.table);
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${tableName}))`);

  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${target.positionColumn}) + 1, 0)::int` })
    .from(target.table)
    .where(target.scope);

  return row?.next ?? 0;
}

/* Sets positions 0..n in the given order. The ids must be exactly the rows in the scope. */
export async function reorder(db: DbOrTx, target: OrderedTable, orderedIds: string[]) {
  const scopeRows = await db
    .select({ id: target.idColumn })
    .from(target.table)
    .where(target.scope);

  const scopeIds = new Set(scopeRows.map((row) => String(row.id)));
  const hasSameIds =
    scopeIds.size === orderedIds.length && orderedIds.every((id) => scopeIds.has(id));

  if (!hasSameIds) {
    throw new CmsValidationError("The list changed while you were editing. Reload and try again.");
  }

  if (orderedIds.length === 0) return;

  const positionCases = sql.join(
    orderedIds.map((id, index) => sql`when ${target.idColumn} = ${id} then ${index}::int`),
    sql` `
  );

  await db
    .update(target.table)
    .set({ [target.positionColumn.name]: sql`case ${positionCases} end` })
    .where(inArray(target.idColumn, orderedIds));
}
