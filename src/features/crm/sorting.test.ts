import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SortableTableHead } from "@/components/crm/sortable-table-head";
import { inquiryListSchema } from "./schemas";
import { registrationListSchema, registrationSessionListSchema } from "./registration-staff-schemas";
import { registrationWorkspaceSearchSchema } from "./registration-navigation";

it("only accepts known sort columns and directions at the server boundary", () => {
  for (const [schema, input, columns] of [
    [inquiryListSchema, {}, ["company", "program", "status", "createdAt", "slaDueAt"]],
    [registrationSessionListSchema, {}, ["workshopTitle", "date", "venueName", "reserved", "paid"]],
    [registrationListSchema, { workshopSessionId: "12345678-abcd-4000-8000-123456789abc" }, ["fullName", "status", "priceCentavos", "createdAt"]]
  ] as const) {
    for (const sort of columns) for (const direction of ["asc", "desc"])
      expect(schema.safeParse({ ...input, sort, direction }).success).toBe(true);
    for (const sort of ["id; drop table registration", "unknown", "__proto__"])
      expect(schema.safeParse({ ...input, sort }).success).toBe(false);
    expect(schema.safeParse({ ...input, direction: "unknown" }).success).toBe(false);
  }
});
it("carries independent workshop and registrant sorting through detail navigation", () => {
  expect(registrationWorkspaceSearchSchema.parse({ sort: "fullName", direction: "asc", runSort: "reserved", runDirection: "desc" }))
    .toMatchObject({ sort: "fullName", direction: "asc", runSort: "reserved", runDirection: "desc" });
});
it("exposes accessible sorting and a keyboard-operable header button", () => {
  const onClick = vi.fn();
  for (const [active, direction, expected] of [[true, "asc", "ascending"], [true, "desc", "descending"], [false, "asc", "none"]] as const) {
    const header = SortableTableHead({ active, direction, onClick, children: "Registrant" });
    const html = renderToStaticMarkup(createElement("table", {}, createElement("thead", {}, createElement("tr", {}, header))));
    expect(html).toContain(`aria-sort="${expected}"`);
    expect(html).toContain('type="button"');
  }
});
