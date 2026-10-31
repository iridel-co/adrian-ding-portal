import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CrmTablePagination } from "@/components/crm/table-pagination";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { crmPaginationSearchSchema, crmPageSizes } from "./pagination";
import { inquirySearchSchema } from "./inquiry-navigation";
import { registrationWorkspaceSearchSchema } from "./registration-navigation";

function find(node: ReactNode, type: unknown, label?: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === type && (!label || child.props["aria-label"] === label)) return child;
    const result = find(child.props.children as ReactNode, type, label);
    if (result) return result;
  }
}
const props = { limit: 25, offset: 50, count: 25, hasMore: true, fetching: false, onChange: vi.fn() };
it("accepts only the supported sizes and aligns URL offsets to the selected size", () => {
  expect(crmPaginationSearchSchema.parse({})).toEqual({ limit: 25, offset: 0 });
  for (const limit of crmPageSizes) {
    expect(crmPaginationSearchSchema.parse({ limit: String(limit), offset: "79" }))
      .toEqual({ limit, offset: Math.floor(79 / limit) * limit });
  }
  for (const limit of [0, -1, 15, 101, "bad", null]) expect(crmPaginationSearchSchema.parse({ limit }).limit).toBe(25);
  for (const offset of [-1, 1.5, 100001, "bad"]) expect(crmPaginationSearchSchema.parse({ offset }).offset).toBe(0);
});
it("retains the list sizes and offsets carried through detail links", () => {
  expect(registrationWorkspaceSearchSchema.parse({ limit: "10", offset: "79", runLimit: "25", runOffset: "79" }))
    .toMatchObject({ limit: 10, offset: 70, runLimit: 25, runOffset: 75 });
  expect(inquirySearchSchema.parse({ status: "WON", search: "Company", limit: "25", offset: "79" }))
    .toEqual({ status: "WON", search: "Company", limit: 25, offset: 75, sort: "createdAt", direction: "desc" });
});
it("groups the range and controls, changes size from page one and pages by the chosen size", () => {
  const onChange = vi.fn();
  const tree = CrmTablePagination({ ...props, onChange });
  const html = renderToStaticMarkup(tree);
  expect(html).toContain("justify-end");
  expect(html).toContain("51–75");
  expect(html).toContain("Rows per page");
  expect(html).toContain('aria-label="Page 3"');
  const select = find(tree, Select)!;
  (select.props.onValueChange as (value: string) => void)("10");
  expect(onChange).toHaveBeenLastCalledWith({ limit: 10, offset: 0 });
  (select.props.onValueChange as (value: string) => void)("bad");
  expect(onChange).toHaveBeenCalledOnce();
  (find(tree, Button, "Previous page")!.props.onClick as () => void)();
  expect(onChange).toHaveBeenLastCalledWith({ limit: 25, offset: 25 });
  (find(tree, Button, "Next page")!.props.onClick as () => void)();
  expect(onChange).toHaveBeenLastCalledWith({ limit: 25, offset: 75 });
});
it("handles empty, partial and final pages and disables controls during loading", () => {
  const first = CrmTablePagination({ ...props, offset: 0, count: 0, hasMore: false });
  expect(renderToStaticMarkup(first)).toContain("0 results");
  expect(find(first, Button, "Previous page")!.props.disabled).toBe(true);
  expect(find(first, Button, "Next page")!.props.disabled).toBe(true);
  expect(renderToStaticMarkup(CrmTablePagination({ ...props, count: 7, hasMore: false }))).toContain("51–57");
  const loading = CrmTablePagination({ ...props, fetching: true });
  expect(find(loading, Select)!.props.disabled).toBe(true);
  expect(find(loading, Button, "Previous page")!.props.disabled).toBe(true);
  expect(find(loading, Button, "Next page")!.props.disabled).toBe(true);
  expect(find(CrmTablePagination({ ...props, offset: 100000 }), Button, "Next page")!.props.disabled).toBe(true);
});
