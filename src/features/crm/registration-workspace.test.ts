import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const harness = vi.hoisted(() => ({
  headers: [] as Record<string, unknown>[],
  search: { tab: "overview", filter: "paid", search: "Alice", offset: 50, limit: 50, runLimit: 50, runWhen: "past", runOffset: 100 },
  summary: {} as Record<string, unknown>, list: {} as Record<string, unknown>,
  navigate: vi.fn(), summaryRefresh: vi.fn(), listRefresh: vi.fn(), query: vi.fn(), get: vi.fn(), registrations: vi.fn()
}));
vi.mock("./functions", () => ({ $getRegistrationSession: harness.get, $listRegistrations: harness.registrations,
  $listRegistrationSessions: vi.fn() }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (options: { queryKey: unknown[] }) => {
    harness.query(options);
    return options.queryKey[1] === "session" ? harness.summary : harness.list;
  }
}));
vi.mock("@/components/table/sortable-table-head", async original => {
  const actual = await original<typeof import("@/components/table/sortable-table-head")>();
  return { SortableTableHead: (props: Parameters<typeof actual.SortableTableHead>[0]) => {
    harness.headers.push(props);
    return actual.SortableTableHead(props);
  } };
});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ sessionId: "12345678-abcd-4000-8000-123456789abc" }),
    useSearch: () => harness.search, useNavigate: () => harness.navigate }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children)
}));
import { Route } from "@/routes/_app/registrations/sessions/$sessionId";
import { TablePagination } from "@/components/table/table-pagination";
import { SelectionBar } from "@/components/table/selection-bar";
import { FilterSelect } from "@/components/cms/content-list-page";
import { RefreshButton } from "@/components/refresh-button";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { registrationSessionQueryOptions, registrationsQueryOptions } from "./registration-queries";

const sessionId = "12345678-abcd-4000-8000-123456789abc";
const run = {
  id: sessionId, workshopTitle: "Practical Selling", courseCode: "PSW", date: "2027-01-12", endDate: "2027-01-13",
  startTime: "09:00:00", endTime: "17:00:00", venueName: "Training Room", city: "Cebu", status: "open", capacity: 20, priceCentavos: 650000,
  counts: { reserved: 18, remaining: 2, paid: 10, unpaid: 8, cancelled: 1 }
};
const item = { id: sessionId, fullName: "Alice <script>unsafe</script>", email: "alice@example.invalid", phone: "+630000000000",
  reference: "AD-PSW-0001", priceCentavos: 650000, isPaid: false, cancelledAt: "2026-10-19T01:00:00Z", createdAt: "2026-10-19T00:00:00Z" };
const Component = Route.options.component as ComponentType;
/* The app root provides tooltips, so the tests do too. */
const render = () => renderToStaticMarkup(createElement(TooltipProvider, { children: createElement(Component) }));
function tree() {
  let result: ReactElement<Record<string, unknown>>;
  function Capture() {
    result = (Component as () => ReactElement<Record<string, unknown>>)();
    return result;
  }
  renderToStaticMarkup(createElement(TooltipProvider, { children: createElement(Capture) }));
  return result!;
}
function find(node: ReactNode, type: unknown, label?: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === type && (!label || child.props.children === label || child.props["aria-label"] === `${label} page`)) return child;
    if (child.type === TablePagination) {
      const found = find(TablePagination(child.props as Parameters<typeof TablePagination>[0]), type, label);
      if (found) return found;
    }
    // Look in children and in any prop holding elements, like DetailHeader's crumb and actions.
    const nested = Object.entries(child.props).filter(([key, value]) => key === "children" || isValidElement(value));
    for (const [, value] of nested) {
      const result = find(value as ReactNode, type, label);
      if (result) return result;
    }
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.search = { tab: "overview", filter: "paid", search: "Alice", offset: 50, limit: 50, runLimit: 50, runWhen: "past", runOffset: 100 };
  harness.summary = { data: structuredClone(run), isError: false, isPending: false, isFetching: false, error: null, refetch: harness.summaryRefresh };
  harness.list = { data: { items: [item], hasMore: true }, isError: false, isPending: false, isFetching: false, error: null, refetch: harness.listRefresh };
});

describe("Workshop workspace", () => {
  it("sorts from column headers, toggles direction and resets pagination while keeping filters", () => {
    harness.search.tab = "registrations";
    for (const direction of ["desc", "asc"]) {
      Object.assign(harness.search, { sort: "fullName", direction });
      harness.headers = [];
      render();
      const header = harness.headers.find(header => header.children === "Registrant")!;
      expect(header.active).toBe(true);
      (header.onClick as () => void)();
      expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search,
        sort: "fullName", direction: direction === "asc" ? "desc" : "asc", offset: 0 } });
    }
    expect(harness.headers.map(header => header.children)).not.toContain("Actions");
  });

  it("offers row and bulk actions for unpaid registrations only", () => {
    harness.search.tab = "registrations";
    harness.list.data = { items: [
      { ...item, cancelledAt: null },
      { ...item, id: "paid", reference: "AD-PSW-0002", cancelledAt: null, isPaid: true },
      { ...item, id: "cancelled", reference: "AD-PSW-0003" }
    ], hasMore: false };
    const html = render();
    expect(html).toContain("Select all unpaid registrations on this page");
    // The bulk bar only appears once a row is picked.
    expect(html).not.toContain(">Clear</button>");
    expect(html).not.toContain(" selected</p><button");
    expect(html).toContain('aria-label="Mark AD-PSW-0001 Paid"');
    expect(html).toContain('aria-label="Cancel AD-PSW-0001"');
    expect(html).not.toContain('aria-label="Mark AD-PSW-0002 Paid"');
    expect(html).not.toContain('aria-label="Cancel AD-PSW-0003"');
  });
  it("shows seats and workshop details on the overview without loading registrations", () => {
    const html = render();
    expect(harness.query.mock.calls[1][0]).toMatchObject({ enabled: false });
    for (const value of ["Practical Selling", "AD-PSW", "Training Room", "Cebu", "Manila time", "18 / 20", "Reserved capacity",
      "Paid", "Unpaid", "Cancelled", "Seats left", "2 seats left", "₱6,500", "20 seats", "Edit session", "/content/sessions/$id"])
      expect(html).toContain(value);
    expect(html).toContain("aria-valuenow=\"90\"");
    expect(html).not.toContain("alice@example.invalid");
    expect(html).not.toContain("Recent registrations");
    expect(html).not.toContain("Page 2");
  });
  it("shows registrant rows with escaped names and cancellation precedence", () => {
    harness.search.tab = "registrations";
    const html = render();
    expect(harness.query.mock.calls[1][0]).toMatchObject({ enabled: true });
    for (const value of ["alice@example.invalid", "Cancelled", "₱6,500", "/registrations/$id"]) expect(html).toContain(value);
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain(">Reference</th>");
    expect(html).not.toContain(">AD-PSW-0001</td>");
  });
  it("shows the picked count, select all and clear on the selection bar", () => {
    const html = renderToStaticMarkup(createElement(SelectionBar, { count: 1, total: 3, onSelectAll: vi.fn(), onClear: vi.fn(), children: "Actions" }));
    for (const value of ["1 of 3 selected", "Select all 3", "Clear", "Actions"]) expect(html).toContain(value);
    expect(renderToStaticMarkup(createElement(SelectionBar, { count: 3, total: 3, onSelectAll: vi.fn(), onClear: vi.fn(), children: "Actions" })))
      .not.toContain("Select all");
  });
  it("clamps empty, full and over-capacity bars while retaining actual counts", () => {
    for (const [reserved, value] of [[0, 0], [20, 100], [24, 100]]) {
      harness.summary.data = { ...run, counts: { ...run.counts, reserved } };
      const html = render();
      expect(html).toContain(`aria-valuenow="${value}"`);
      expect(html).toContain(`${reserved} / 20`);
      expect(html.includes("Reservations exceed")).toBe(reserved > 20);
    }
  });
  it("keeps list failures separate from the summary and does not render cached failed rows", () => {
    harness.search.tab = "registrations";
    harness.list.isError = true; harness.list.error = new Error("crm_unavailable");
    let html = render();
    expect(html).toContain("Practical Selling"); expect(html).toContain("Try again");
    expect(html).not.toContain("alice@example.invalid");
    harness.summary.isError = true; harness.summary.error = new Error("registration_session_not_found");
    html = render();
    expect(html).toContain("This scheduled workshop could not be found"); expect(html).not.toContain("Practical Selling");
  });
  it("suppresses the entire workspace on access failure from either request", () => {
    for (const result of [harness.summary, harness.list]) {
      result.isError = true; result.error = new Error("staff_access_required");
      const html = render();
      expect(html).toContain("Registration access unavailable");
      expect(html).not.toContain("Practical Selling"); expect(html).not.toContain("alice@example.invalid");
      result.isError = false; result.error = null;
    }
    harness.summary.data = undefined; harness.summary.isPending = true;
    expect(render()).toContain("Loading scheduled workshop");
    expect(harness.query.mock.calls.at(-1)?.[0].enabled).toBe(false);
  });
  it("preserves scroll and tab/list/back state, and refreshes both visible reads", () => {
    const page = tree();
    const tabs = find(page, Tabs)!;
    (tabs.props.onValueChange as (value: string) => void)("registrations");
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, tab: "registrations" }, resetScroll: false });
    (tabs.props.onValueChange as (value: string) => void)("overview");
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, tab: "overview" }, resetScroll: false });
    // The overview has no list, so Refresh only reloads the summary there.
    (find(page, RefreshButton)!.props.onClick as () => void)();
    expect(harness.summaryRefresh).toHaveBeenCalledOnce(); expect(harness.listRefresh).not.toHaveBeenCalled();
    harness.search.tab = "registrations";
    (find(tree(), RefreshButton)!.props.onClick as () => void)();
    expect(harness.summaryRefresh).toHaveBeenCalledTimes(2); expect(harness.listRefresh).toHaveBeenCalledOnce();
    const back = find(page, Link)!;
    expect(back.props.search).toEqual({ when: "past", offset: 100, limit: 50 });
  });
  it("uses the scoped full-list query and resets page on search and filter changes", () => {
    harness.search.tab = "registrations";
    const page = tree();
    expect(harness.query.mock.calls[1][0].queryKey[2]).toEqual({ workshopSessionId: sessionId, filter: "paid", search: "Alice", offset: 50, limit: 50 });
    expect(render()).toContain("Page 2");
    expect(render()).not.toContain("Search covers registrations");
    (find(page, FilterSelect)!.props.onChange as (value: string) => void)("cancelled");
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, filter: "cancelled", offset: 0 } });
    const formData = class { get() { return "  Bob  "; } };
    vi.stubGlobal("FormData", formData);
    try {
      const preventDefault = vi.fn();
      (find(page, "form")!.props.onSubmit as (event: unknown) => void)({ currentTarget: {}, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, search: "Bob", offset: 0 } });
    } finally { vi.unstubAllGlobals(); }
    (find(page, Button, "Next")!.props.onClick as () => void)();
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, offset: 100 } });
    (find(page, Button, "Previous")!.props.onClick as () => void)();
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, offset: 0 } });
  });
  it("filters registrants with a status dropdown that includes all registrations", () => {
    harness.search.tab = "registrations";
    harness.search.filter = "active";
    let page = tree();
    const filter = find(page, FilterSelect)!;
    expect(filter.props.value).toBe("active");
    expect((filter.props.options as { value: string }[]).map(option => option.value)).toEqual(["active", "unpaid", "paid", "cancelled", "all"]);
    (filter.props.onChange as (value: string) => void)("all");
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, filter: "all", offset: 0 } });
    harness.search.filter = "all";
    page = tree();
    expect(harness.query.mock.calls.at(-1)?.[0].queryKey[2].filter).toBe("all");
    expect(render()).toContain('aria-label="Registration status"');
  });
  it("queries the selected page size and keeps filters when the pagination changes", () => {
    harness.search.tab = "registrations";
    harness.search.limit = 10;
    harness.search.offset = 20;
    const page = tree();
    expect(harness.query.mock.calls[1][0].queryKey[2]).toEqual({
      workshopSessionId: sessionId, filter: "paid", search: "Alice", offset: 20, limit: 10
    });
    const controls = find(page, TablePagination)!;
    (controls.props.onChange as (value: object) => void)({ limit: 25, offset: 0 });
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, limit: 25, offset: 0 } });
  });
  it("handles empty full lists and disables paging at boundaries and while fetching", () => {
    harness.search.tab = "registrations"; harness.search.offset = 0;
    harness.list.data = { items: [], hasMore: false };
    expect(render()).toContain("No registrations match these filters");
    expect(find(tree(), Button, "Previous")!.props.disabled).toBe(true);
    expect(find(tree(), Button, "Next")!.props.disabled).toBe(true);
    harness.search.offset = 100000; harness.list.data = { items: [item], hasMore: true };
    expect(find(tree(), Button, "Next")!.props.disabled).toBe(true);
    harness.search.offset = 50; harness.list.isFetching = true;
    expect(find(tree(), Button, "Previous")!.props.disabled).toBe(true);
    expect(find(tree(), Button, "Next")!.props.disabled).toBe(true);
    expect(find(tree(), RefreshButton)!.props.isRefreshing).toBe(true);
  });
  it("validates direct-link defaults and URL state without arbitrary tabs or filters", () => {
    const schema = Route.options.validateSearch as z.ZodType;
    expect(schema.parse({})).toEqual({ tab: "overview", filter: "active", search: "", offset: 0, limit: 25, runLimit: 25, runWhen: "upcoming", runStatus: "all", runOffset: 0, sort: "createdAt", direction: "desc", runSort: "status", runDirection: "asc" });
    expect(schema.parse({ tab: "registrations", search: " Alice ", offset: "79", runWhen: "past", runStatus: "closed", runOffset: "129" }))
      .toMatchObject({ search: "Alice", offset: 75, limit: 25, runLimit: 25, runWhen: "past", runStatus: "closed", runOffset: 125 });
    for (const offset of [-1, "bad", 100001]) expect(schema.parse({ offset })).toMatchObject({ offset: 0 });
    for (const invalid of [{ tab: "bad" }, { filter: "bad" }, { search: "x".repeat(201) }]) expect(schema.safeParse(invalid).success).toBe(false);
  });
});

it("keeps preview/full-list cache keys distinct and forwards IDs, filters and abort signals", async () => {
  const signal = new AbortController().signal;
  const preview = registrationsQueryOptions({ workshopSessionId: sessionId, filter: "all", search: "", offset: 0, limit: 5 });
  const full = registrationsQueryOptions({ workshopSessionId: sessionId, filter: "all", search: "", offset: 0, limit: 50 });
  expect(preview.queryKey).not.toEqual(full.queryKey);
  const summary = registrationSessionQueryOptions(sessionId);
  for (const options of [summary, preview, full]) {
    if (typeof options.queryFn !== "function") throw new Error("Missing query function");
    await options.queryFn({ client: new QueryClient(), queryKey: options.queryKey, signal, meta: undefined } as never);
    expect(options).toMatchObject({ retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000 });
  }
  expect(harness.get).toHaveBeenCalledWith({ data: { id: sessionId }, signal });
  expect(harness.registrations).toHaveBeenCalledWith({ data: { workshopSessionId: sessionId, filter: "all", search: "", offset: 0, limit: 5 }, signal });
  expect(harness.registrations).toHaveBeenCalledWith({ data: { workshopSessionId: sessionId, filter: "all", search: "", offset: 0, limit: 50 }, signal });
});
