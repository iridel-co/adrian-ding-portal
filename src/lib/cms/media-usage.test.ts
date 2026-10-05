import { getTableColumns, isTable } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { MEDIA_REFERENCES } from "@/lib/cms/media-usage";

function findMediaColumns() {
  const columns = [];

  for (const value of Object.values(schema)) {
    if (!isTable(value)) continue;

    for (const column of Object.values(getTableColumns(value))) {
      if (column.name.endsWith("media_id")) columns.push(column);
    }
  }

  return columns;
}

describe("MEDIA_REFERENCES", () => {
  it("lists every column that points at a media row", () => {
    const referencedColumns = new Set(MEDIA_REFERENCES.map((reference) => reference.mediaColumn));

    const missing = findMediaColumns()
      .filter((column) => !referencedColumns.has(column))
      .map((column) => column.name);

    expect(missing).toEqual([]);
  });
});
