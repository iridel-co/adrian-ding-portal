type SortDirection = "asc" | "desc";

/* The sort after a header click: a new column starts ascending, the same column flips. */
export function nextSort<K extends string>(
  current: { sort?: K; direction: SortDirection },
  column: K
) {
  const isSameColumnAscending = current.sort === column && current.direction === "asc";

  return {
    sort: column,
    direction: isSameColumnAscending ? ("desc" as const) : ("asc" as const),
    offset: 0
  };
}
