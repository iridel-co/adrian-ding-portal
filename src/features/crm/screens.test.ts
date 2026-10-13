import { Children, createElement, isValidElement, type ReactElement, type ReactNode, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ result: {} as Record<string, unknown>, access: vi.fn(), navigate: vi.fn(), mutate: vi.fn(), invalidate: vi.fn(), mutationError: null as Error | null }));
vi.mock("./functions", () => ({ $crmAccess: harness.access, $listInquiries: vi.fn(), $getInquiry: vi.fn(), $changeInquiry: vi.fn(), $retryInquiryEmail: vi.fn() }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: () => harness.result,
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
  useMutation: () => ({ isPending: false, error: harness.mutationError, reset: vi.fn(), mutate: harness.mutate })
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ id: "12345678-abcd-4000-8000-123456789abc" }),
    useSearch: () => ({ status: "all", search: "", offset: 0 }), useNavigate: () => harness.navigate }),
  Link: ({ children }: { children: import("react").ReactNode }) => createElement("a", {}, children),
  redirect: (options: object) => ({ redirect: true, ...options })
}));
import { Route as ListRoute } from "@/routes/_app/inquiries/index";
import { Route as DetailRoute } from "@/routes/_app/inquiries/$id";
import { Route as LandingRoute } from "@/routes/_app/index";
import { Dialog } from "@/components/ui/dialog";
import { InquiryActions, type InquiryDraft } from "@/components/crm/inquiry-actions";
import { inquiryTransitions } from "./lifecycle";
import { inquiryActionLabels } from "./presentation";

const inquiry = {
  id: "12345678-abcd-4000-8000-123456789abc", company: "Sample Company", fullName: "Maya", role: "HR manager", email: "maya@company.test", phone: "+639171234567",
  program: "Leadership", attendees: "20", targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14", targetDateText: null,
  venue: "Manila", context: "<script>untrusted</script>", alsoInterested: ["Coaching"], status: "NEW",
  slaDueAt: new Date("2026-10-01T00:00:00Z"), createdAt: new Date("2026-09-29T00:00:00Z"), contactedAt: null, proposalSentAt: null, closedAt: null,
  estimatedValueCentavos: null, lostReason: null, history: [], historyHasMore: false,
  emailJobs: [
    { id: "e1", kind: "corporate_acknowledgment", state: "failed", attemptCount: 1, lastAttemptAt: null, sentAt: null, leaseExpiresAt: null, lastErrorCode: null },
    { id: "e2", kind: "corporate_notification", state: "sent", attemptCount: 1, lastAttemptAt: null, sentAt: new Date(), leaseExpiresAt: null, lastErrorCode: null }
  ]
};
const render = (route: typeof ListRoute | typeof DetailRoute) => renderToStaticMarkup(createElement(route.options.component as ComponentType));
beforeEach(() => { harness.result = { isPending: false, isError: false, isFetching: false, error: null }; harness.access.mockReset(); harness.mutate.mockReset(); harness.mutationError = null; });

describe("Staff inquiry screens", () => {
  it("shows list fields and overdue state", () => {
    harness.result.data = { items: [inquiry], hasMore: false };
    const html = render(ListRoute);
    for (const text of ["Sample Company", "Maya", "Leadership", "First reply due", "Overdue", "Page 1"]) expect(html).toContain(text);
  });
  it("shows loading/empty/error states and hides cached customer data on errors", () => {
    harness.result.isPending = true;
    expect(render(ListRoute)).toContain("Loading inquiries");
    harness.result.isPending = false; harness.result.data = { items: [], hasMore: false };
    expect(render(ListRoute)).toContain("No inquiries match");
    harness.result.data = { items: [inquiry], hasMore: false }; harness.result.isError = true; harness.result.error = new Error("staff_access_required");
    expect(render(ListRoute)).toContain("Your account does not have inquiry access");
    expect(render(ListRoute)).not.toContain("Sample Company");
    harness.result.data = inquiry;
    expect(render(DetailRoute)).not.toContain("Sample Company");
  });
  it("shows every submitted requirement, date range, and provider acceptance with escaped customer text", () => {
    harness.result.data = inquiry;
    const html = render(DetailRoute);
    for (const text of ["HR manager", "maya@company.test", "Manila", "Jan 12, 2027", "Jan 14, 2027", "Coaching", "Customer acknowledgement", "Staff notification", "Accepted by email provider"]) expect(html).toContain(text);
    expect(html).toContain("&lt;script&gt;untrusted&lt;/script&gt;");
    expect(html).not.toContain("<script>untrusted</script>");
    expect(html.match(/>Retry email</g)).toHaveLength(1);
  });
  it("offers precisely the permitted actions for each lifecycle state", () => {
    for (const status of Object.keys(inquiryTransitions) as (keyof typeof inquiryTransitions)[]) {
      harness.result.data = { ...inquiry, status };
      const html = render(DetailRoute);
      for (const next of ["CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SPAM"] as const) {
        expect(html.includes(`>${inquiryActionLabels[next]}<`)).toBe(inquiryTransitions[status].includes(next));
      }
    }
  });
  it("supports rough dates and zero proposal values", () => {
    harness.result.data = { ...inquiry, targetDateFrom: null, targetDateTo: null, targetDateText: "Early next year", estimatedValueCentavos: 0 };
    expect(render(DetailRoute)).toContain("Early next year");
    expect(render(DetailRoute)).toContain("₱0");
  });
  it("lands assigned users on inquiries and leaves unassigned users on existing settings", async () => {
    const beforeLoad = LandingRoute.options.beforeLoad as () => Promise<unknown>;
    harness.access.mockResolvedValue({ role: "staff" });
    await expect(beforeLoad()).rejects.toMatchObject({ to: "/inquiries" });
    harness.access.mockRejectedValue(new Error("staff_access_required"));
    await expect(beforeLoad()).rejects.toMatchObject({ to: "/settings/access" });
    harness.access.mockRejectedValue(new Error("access_unavailable"));
    await expect(beforeLoad()).rejects.toThrow("access_unavailable");
  });
});

function findElement(node: ReactNode, type: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === type) return child;
    const found = findElement(child.props.children as ReactNode, type);
    if (found) return found;
  }
}

describe("Status confirmation forms", () => {
  const draft: InquiryDraft = { selected: "PROPOSAL_SENT", expectedStatus: "CONTACTED", value: 1250000, reason: "", validation: "" };
  const submit = (tree: ReactNode) => (findElement(tree, "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
  it("sends the reviewed status and validated proposal value, and blocks an empty amount", () => {
    const setDraft = vi.fn();
    submit(InquiryActions({ inquiry: { id: inquiry.id, status: "CONTACTED" }, draft, setDraft }));
    expect(harness.mutate).toHaveBeenCalledWith({ id: inquiry.id, expectedStatus: "CONTACTED", status: "PROPOSAL_SENT", estimatedValueCentavos: 1250000 });
    harness.mutate.mockClear();
    submit(InquiryActions({ inquiry: { id: inquiry.id, status: "CONTACTED" }, draft: { ...draft, value: null }, setDraft }));
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(setDraft).toHaveBeenCalled();
  });
  it("blocks a stale confirmation, shows the latest status and retains the loss reason", () => {
    const setDraft = vi.fn();
    const tree = InquiryActions({ inquiry: { id: inquiry.id, status: "CONTACTED" }, draft: { ...draft, selected: "LOST", expectedStatus: "NEW", reason: "Budget unavailable" }, setDraft });
    submit(tree);
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(setDraft).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(tree);
    // Radix portals omit their content in server rendering; inspect the form itself.
    const form = renderToStaticMarkup(createElement(Dialog, { open: true }, findElement(tree, "form")!));
    expect(form).toContain("Budget unavailable");
    expect(form).toContain("latest status is Contacted");
    expect(html).toContain("Record sent proposal");
  });
  it("keeps entered values and displays a safe failure message", () => {
    harness.mutationError = new Error("crm_unavailable");
    const tree = InquiryActions({ inquiry: { id: inquiry.id, status: "CONTACTED" }, draft, setDraft: vi.fn() });
    const form = renderToStaticMarkup(createElement(Dialog, { open: true }, findElement(tree, "form")!));
    expect(form).toContain("12500");
    expect(form).toContain("Unable to load or save this inquiry");
  });
});
