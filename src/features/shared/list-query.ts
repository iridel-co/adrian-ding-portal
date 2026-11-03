import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

type SortDirection = "asc" | "desc";

type Page = {
  limit?: number;
  offset: number;
};

type PageableQuery<T> = PromiseLike<T[]> & {
  limit: (limit: number) => { offset: (offset: number) => PromiseLike<T[]> };
};

/* Empty values sort last in both directions, so a column sort never opens on blanks. */
export function sortOrder(column: SQLWrapper, direction: SortDirection): SQL {
  return sql`${column} ${sql.raw(direction)} nulls last`;
}

/* Escapes SQL wildcard characters so a search matches the text the user typed. */
export function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, "\\$&");
}

/* One page of a query, or every row when the page has no limit. */
export async function fetchPage<T>(query: PageableQuery<T>, page: Page) {
  if (page.limit === undefined) {
    return {
      items: await query,
      hasMore: false
    };
  }

  const rows = await query.limit(page.limit + 1).offset(page.offset);
  return {
    items: rows.slice(0, page.limit),
    hasMore: rows.length > page.limit
  };
}
