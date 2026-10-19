import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const harness = vi.hoisted(() => ({
  result: {} as Record<string, unknown>, search: { when: "upcoming", offset: 0 },
  access: vi.fn(), list: vi.fn(), navigate: vi.fn(), refetch: vi.fn()
}));
vi.mock("./functions", () => ({ $crmAccess: harness.access, $listRegistrationSessions: harness.list,
  $listInquiries: vi.fn(), $getInquiry: vi.fn() }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: () => harness.result,
  useQueryClient: () => ({ clear: vi.fn() })
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => harness.search, useNavigate: () => harness.navigate }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
  Outlet: () => null,
  useRouter: () => ({ navigate: harness.navigate })
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
import { Route as GuardRoute } from "@/routes/_app/registrations";
import { Route as ListRoute } from "@/routes/_app/registrations/index";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { registrationSessionsQueryOptions } from "./registration-queries";

const run = {
  id: "12345678-abcd-4000-8000-123456789abc", workshopTitle: "Practical Selling <script>unsafe</script>", courseCode: "PSW",
  date: "2027-01-12", endDate: "2027-01-13", startTime: "09:00:00", endTime: "17:00:00",
  venueName: "Training Room", city: "Cebu", status: "open", capacity: 20,
  counts: { reserved: 18, remaining: 2, paid: 10, unpaid: 8, cancelled: 1 }
};
const Component = ListRoute.options.component as ComponentType;
const render = () => renderToStaticMarkup(createElement(Component));
const tree = () => (Component as () => ReactElement<Record<string, unknown>>)();
function findButton(node: ReactNode, label: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === Button && child.props.children === label) return child;
    const found = findButton(child.props.children as ReactNode, label);
    if (found) return found;
  }
}
const click = (button: ReactElement<Record<string, unknown>>) => (button.props.onClick as () => void)();
beforeEach(() => {
  vi.clearAllMocks();
  harness.search = { when: "upcoming", offset: 0 };
  harness.result = { isPending: false, isError: false, isFetching: false, error: null,
    data: { items: [run], hasMore: true }, refetch: harness.refetch };
});

describe("Workshop run list", () => {
  it("shows run context, independent seat/payment counts and safely escaped titles", () => {
    const html = render();
    for (const value of ["Workshop registrations", "PSW", "Jan 12, 2027", "Jan 13, 2027", "Training Room", "Cebu",
      "Open", "Upcoming workshop runs", "18 / 20", "2 remaining", "10 paid", "8 unpaid", "Manila", "Page 1"])
      expect(html).toContain(value);
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe</script>");
    expect(html).not.toContain("/registrations/sessions/");
  });
  it("shows registration-specific loading, empty and safe errors and suppresses cached rows on failure", () => {
    harness.result.isPending = true; harness.result.data = undefined;
    expect(render()).toContain("Loading workshop runs");
    harness.result.isPending = false; harness.result.data = { items: [], hasMore: false };
    expect(render()).toContain("No workshop runs match these dates");
    harness.result.data = { items: [run], hasMore: true }; harness.result.isError = true;
    for (const [code, message] of [["staff_access_required", "Registration access unavailable"],
      ["crm_unavailable", "Unable to load workshop registrations"], ["Unauthorized", "Sign in again"],
      ["private connection details", "The request could not be completed"]]) {
      harness.result.error = new Error(code);
      const html = render();
      expect(html).toContain(message); expect(html).not.toContain("Practical Selling");
      expect(html).not.toContain("Loading inquiries"); expect(html).not.toContain("private connection details");
    }
  });
  it("keeps filters/page in navigation state and resets pagination when dates change", () => {
    harness.search = { when: "past", offset: 100 };
    const page = tree();
    click(findButton(page.props.filters as ReactNode, "All dates")!);
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { when: "all", offset: 0 } });
    click(findButton(page, "Next")!);
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { when: "past", offset: 150 } });
    click(findButton(page, "Previous")!);
    expect(harness.navigate).toHaveBeenLastCalledWith({ search: { when: "past", offset: 50 } });
    click(page.props.action as ReactElement<Record<string, unknown>>);
    expect(harness.refetch).toHaveBeenCalledOnce();
  });
  it("makes date filters visible and labels past runs independently of run status", () => {
    harness.search = { when: "past", offset: 0 };
    expect(render()).toContain("Past workshop runs");
    expect(findButton(tree().props.filters as ReactNode, "Past")!.props["aria-pressed"]).toBe(true);
    expect(findButton(tree().props.filters as ReactNode, "Upcoming")!.props["aria-pressed"]).toBe(false);
    harness.search.when = "all";
    harness.result.data = { items: [{ ...run, date: "2000-01-01", endDate: "2000-01-01" }], hasMore: false };
    const html = render();
    expect(html).toContain("All workshop runs");
    expect(html).toContain(">Past</span>");
    expect(html).toContain(">Open</span>");
    harness.result.data = { items: [{ ...run, date: "2099-01-01", endDate: "2099-01-01" }], hasMore: false };
    expect(render()).toContain(">Upcoming</span>");
  });
  it("disables paging at boundaries and while fetching", () => {
    expect(findButton(tree(), "Previous")!.props.disabled).toBe(true);
    harness.result.data = { items: [run], hasMore: false };
    expect(findButton(tree(), "Next")!.props.disabled).toBe(true);
    harness.result.data = { items: [run], hasMore: true }; harness.search.offset = 100000;
    expect(findButton(tree(), "Next")!.props.disabled).toBe(true);
    harness.search.offset = 50; harness.result.isFetching = true;
    const page = tree();
    expect(findButton(page, "Next")!.props.disabled).toBe(true);
    expect(findButton(page, "Previous")!.props.disabled).toBe(true);
    expect((page.props.action as ReactElement<{ disabled: boolean }>).props.disabled).toBe(true);
  });
  it("normalizes URL page offsets and defaults to Upcoming without accepting arbitrary date filters", () => {
    const schema = ListRoute.options.validateSearch as z.ZodType;
    expect(schema.parse({})).toEqual({ when: "upcoming", offset: 0 });
    expect(schema.parse({ when: "all", offset: "79" })).toEqual({ when: "all", offset: 50 });
    for (const offset of [-1, "bad", 100001]) expect(schema.parse({ when: "past", offset })).toEqual({ when: "past", offset: 0 });
    expect(schema.safeParse({ when: "arbitrary" }).success).toBe(false);
  });
});

describe("Registration access and reads", () => {
  it("uses the current CRM access check for direct navigation and propagates denial", async () => {
    const beforeLoad = GuardRoute.options.beforeLoad as () => Promise<unknown>;
    for (const role of ["staff", "admin"]) {
      harness.access.mockResolvedValue({ role });
      await expect(beforeLoad()).resolves.toEqual({ role });
    }
    harness.access.mockRejectedValue(new Error("staff_access_required"));
    await expect(beforeLoad()).rejects.toThrow("staff_access_required");
  });
  it("shows the sidebar link only with CRM access and keeps existing navigation", () => {
    const sidebar = () => renderToStaticMarkup(createElement(SidebarProvider, {}, createElement(AppSidebar,
      { user: { name: "Test Staff", email: "staff@company.test" } })));
    for (const role of ["staff", "admin"]) {
      harness.result.data = { role }; harness.result.isError = false;
      const html = sidebar();
      expect(html).toContain('href="/registrations"'); expect(html).toContain('href="/inquiries"');
      expect(html).toContain('href="/content/sessions"');
    }
    harness.result.isError = true;
    expect(sidebar()).not.toContain('href="/registrations"');
    harness.result.isError = false; harness.result.data = undefined;
    expect(sidebar()).not.toContain('href="/registrations"');
  });
  it("forwards the filter/page and cancellation signal without persisting the CRM cache", async () => {
    const input = { when: "past" as const, offset: 50, limit: 50 };
    const options = registrationSessionsQueryOptions(input);
    const signal = new AbortController().signal;
    harness.list.mockResolvedValue({ items: [], hasMore: false });
    if (typeof options.queryFn !== "function") throw new Error("Missing registration query function");
    await options.queryFn({ client: new QueryClient(), queryKey: options.queryKey, signal, meta: undefined });
    expect(harness.list).toHaveBeenCalledWith({ data: input, signal });
    expect(options).toMatchObject({ retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000 });
  });
});
