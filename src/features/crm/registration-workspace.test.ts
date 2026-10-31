import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const harness = vi.hoisted(() => ({
  search: { tab: "overview", filter: "paid", search: "Alice", offset: 50, runWhen: "past", runOffset: 100 },
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
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ sessionId: "12345678-abcd-4000-8000-123456789abc" }),
    useSearch: () => harness.search, useNavigate: () => harness.navigate }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children)
}));
import { Route } from "@/routes/_app/registrations/sessions/$sessionId";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { FilterSelect } from "@/components/cms/content-list-page";
import { registrationSessionQueryOptions, registrationsQueryOptions } from "./registration-queries";

const sessionId = "12345678-abcd-4000-8000-123456789abc";
const run = {
  id: sessionId, workshopTitle: "Practical Selling", courseCode: "PSW", date: "2027-01-12", endDate: "2027-01-13",
  startTime: "09:00:00", endTime: "17:00:00", venueName: "Training Room", city: "Cebu", status: "open", capacity: 20,
  counts: { reserved: 18, remaining: 2, paid: 10, unpaid: 8, cancelled: 1 }
};
const item = { id: sessionId, fullName: "Alice <script>unsafe</script>", email: "alice@example.invalid", phone: "+630000000000",
  reference: "AD-PSW-0001", priceCentavos: 650000, isPaid: false, cancelledAt: "2026-10-19T01:00:00Z", createdAt: "2026-10-19T00:00:00Z" };
const Component = Route.options.component as ComponentType;
const render = () => renderToStaticMarkup(createElement(Component));
function tree() {
  let result: ReactElement<Record<string, unknown>>;
  function Capture() {
    result = (Component as () => ReactElement<Record<string, unknown>>)();
    return result;
  }
  renderToStaticMarkup(createElement(Capture));
  return result!;
}
function find(node: ReactNode, type: unknown, label?: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === type && (!label || child.props.children === label)) return child;
    const result = find(child.props.children as ReactNode, type, label);
    if (result) return result;
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.search = { tab: "overview", filter: "paid", search: "Alice", offset: 50, runWhen: "past", runOffset: 100 };
  harness.summary = { data: structuredClone(run), isError: false, isPending: false, isFetching: false, error: null, refetch: harness.summaryRefresh };
  harness.list = { data: { items: [item], hasMore: true }, isError: false, isPending: false, isFetching: false, error: null, refetch: harness.listRefresh };
});

describe("Workshop run workspace", () => {
  it("offers row and bulk actions for unpaid registrations only", () => {
    harness.search.tab = "registrations";
    harness.list.data = { items: [
      { ...item, cancelledAt: null },
      { ...item, id: "paid", reference: "AD-PSW-0002", cancelledAt: null, isPaid: true },
      { ...item, id: "cancelled", reference: "AD-PSW-0003" }
    ], hasMore: false };
    const html = render();
    expect(html).toContain("Select all unpaid registrations on this page");
    expect(html).toContain("Mark selected Paid");
    expect(html).toContain("Cancel selected");
    expect(html).toContain('aria-label="Mark AD-PSW-0001 Paid"');
    expect(html).toContain('aria-label="Cancel AD-PSW-0001"');
    expect(html).not.toContain('aria-label="Mark AD-PSW-0002 Paid"');
    expect(html).not.toContain('aria-label="Cancel AD-PSW-0003"');
  });
  it("loads a bounded unfiltered preview, shows summary totals and gives cancellation precedence", () => {
    const html = render();
    expect(harness.query.mock.calls[1][0]).toMatchObject({ enabled: true,
      queryKey: ["workshop-registrations", "list", { workshopSessionId: sessionId, filter: "all", search: "", offset: 0, limit: 5 }] });
    for (const value of ["Practical Selling", "Training Room", "Cebu", "Manila time", "Recent registrations", "18 / 20",
      "Reserved capacity", "Cancelled", "₱6,500", "alice@example.invalid"])
      expect(html).toContain(value);
    expect(html).toContain("aria-valuenow=\"90\"");
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).toContain("/registrations/$id");
    expect(html).not.toContain(">Reference</th>");
    expect(html).not.toContain(">AD-PSW-0001</td>");
    expect(html).not.toContain("Page 2");
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
  it("keeps preview failures separate from the summary and does not render cached failed rows", () => {
    harness.list.isError = true; harness.list.error = new Error("crm_unavailable");
    let html = render();
    expect(html).toContain("18 / 20"); expect(html).toContain("Try again");
    expect(html).not.toContain("alice@example.invalid"); expect(html).not.toContain("No registrations for this run yet");
    harness.list.isError = false; harness.list.error = null; harness.list.data = { items: [], hasMore: false };
    expect(render()).toContain("No registrations for this run yet");
    harness.summary.isError = true; harness.summary.error = new Error("registration_session_not_found");
    html = render();
    expect(html).toContain("This workshop run could not be found"); expect(html).not.toContain("Practical Selling");
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
    expect(render()).toContain("Loading workshop run");
    expect(harness.query.mock.calls.at(-1)?.[0].enabled).toBe(false);
  });
  it("preserves scroll and tab/list/back state, and refreshes both visible reads", () => {
    const page = tree();
    const tabs = find(page, Tabs)!;
    (tabs.props.onValueChange as (value: string) => void)("registrations");
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, tab: "registrations" }, resetScroll: false });
    (tabs.props.onValueChange as (value: string) => void)("overview");
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, tab: "overview" }, resetScroll: false });
    (find(page, Button, "View all registrations")!.props.onClick as () => void)();
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { ...harness.search, tab: "registrations" }, resetScroll: false });
    (find(page, Button, "Refresh")!.props.onClick as () => void)();
    expect(harness.summaryRefresh).toHaveBeenCalledOnce(); expect(harness.listRefresh).toHaveBeenCalledOnce();
    const top = Children.toArray(page.props.children as ReactNode)[0] as ReactElement<{ children: ReactNode }>;
    const back = Children.toArray(top.props.children)[0] as ReactElement<{ search: unknown }>;
    expect(back.props.search).toEqual({ when: "past", offset: 100 });
  });
  it("uses the scoped full-list query and resets page on search and filter changes", () => {
    harness.search.tab = "registrations";
    const page = tree();
    expect(harness.query.mock.calls[1][0].queryKey[2]).toEqual({ workshopSessionId: sessionId, filter: "paid", search: "Alice", offset: 50, limit: 50 });
    expect(render()).toContain("Page 2");
    expect(render()).toContain("Search covers registrations for this workshop run only");
    (find(page, FilterSelect)!.props.onChange as (filter: string) => void)("cancelled");
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
    expect(find(tree(), Button, "Refresh")!.props.disabled).toBe(true);
  });
  it("validates direct-link defaults and URL state without arbitrary tabs or filters", () => {
    const schema = Route.options.validateSearch as z.ZodType;
    expect(schema.parse({})).toEqual({ tab: "overview", filter: "active", search: "", offset: 0, runWhen: "upcoming", runOffset: 0 });
    expect(schema.parse({ tab: "registrations", search: " Alice ", offset: "79", runWhen: "past", runOffset: "129" }))
      .toMatchObject({ search: "Alice", offset: 50, runWhen: "past", runOffset: 100 });
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
