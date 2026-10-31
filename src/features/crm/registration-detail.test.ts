import { Children, createElement, isValidElement, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  result: {} as Record<string, unknown>, older: {} as Record<string, unknown>, query: vi.fn(), pending: false, mutationError: null as Error | null,
  mutation: {} as Record<string, Function>, mutate: vi.fn(), change: vi.fn(), get: vi.fn(), reset: vi.fn(),
  invalidate: vi.fn(), remove: vi.fn(), toast: vi.fn(), refetch: vi.fn(), accessError: vi.fn(), changed: vi.fn()
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock("./functions", () => ({ $getRegistration: harness.get, $changeRegistration: harness.change,
  $retryRegistrationEmail: vi.fn(), $getRegistrationSession: vi.fn(), $listRegistrations: vi.fn(), $listRegistrationSessions: vi.fn() }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (options: { queryKey: unknown[] }) => {
    harness.query(options);
    return Number(options.queryKey[3]) > 0 ? harness.older : harness.result;
  },
  useQueryClient: () => ({ invalidateQueries: harness.invalidate, removeQueries: harness.remove }),
  useMutation: (options: Record<string, Function>) => {
    harness.mutation = options;
    return { isPending: harness.pending, error: harness.mutationError, reset: harness.reset, mutate: harness.mutate };
  }
}));
vi.mock("sonner", () => ({ toast: { success: harness.toast } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options,
    useParams: () => ({ id: "12345678-abcd-4000-8000-123456789abc" }),
    useSearch: () => ({ tab: "registrations", filter: "paid", search: "Alice", offset: 50, limit: 25, runLimit: 10, runWhen: "past", runOffset: 100 }) }),
  Link: ({ children, to, search, params }: { children: ReactNode; to: string; search: unknown; params: unknown }) =>
    createElement("a", { href: to, "data-search": JSON.stringify(search), "data-params": JSON.stringify(params) }, children)
}));
import { Route } from "@/routes/_app/registrations/$id";
import { RegistrationActions } from "@/components/crm/registration-actions";
import { emptyRegistrationDraft, type RegistrationDraft } from "./registration-presentation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RegistrationAction } from "./registration-staff-schemas";
import { CrmEmailKind } from "@/db/schema/crm-email-kind";
import { CrmEmailState } from "@/db/schema/crm-email-state";
import { registrationQueryKey, registrationQueryOptions } from "./registration-queries";
import type { $getRegistration } from "./functions";

type Registration = Awaited<ReturnType<typeof $getRegistration>>;
const date = new Date("2026-10-19T01:00:00Z");
const record: Registration = {
  id: "12345678-abcd-4000-8000-123456789abc", workshopSessionId: "22345678-abcd-4000-8000-123456789abc",
  reference: "AD-PSW-0001", fullName: "Alice <script>unsafe</script>", email: "alice@example.invalid", phone: "+630000000000",
  occupation: "Sales manager", salaryRange: "Prefer not to say", city: "Cebu", consentAt: date,
  priceCentavos: 650000, isPaid: false, paymentMethod: null, paidAmountCentavos: null, payerName: null,
  providerTransactionReference: null, verifiedAt: null, verifiedBy: null, cancelledAt: null, cancelledBy: null,
  verifiedByName: null, cancelledByName: null, cancellationReason: null, createdAt: date, updatedAt: date,
  session: { id: "22345678-abcd-4000-8000-123456789abc", workshopId: "32345678-abcd-4000-8000-123456789abc",
    workshopTitle: "Practical Selling", courseCode: "PSW", workshopStatus: "draft", date: "2027-01-12", endDate: "2027-01-13",
    startTime: "09:00:00", endTime: "17:00:00", venueName: "Training Room", city: "Cebu", status: "open", capacity: 20,
    priceCentavos: 650000, counts: { reserved: 18, remaining: 2, paid: 10, unpaid: 8, cancelled: 1 }, timeZone: "Asia/Manila" },
  emailJobs: [{ id: "e1", kind: CrmEmailKind.PaymentInstructions, state: CrmEmailState.Failed, attemptCount: 1,
    firstAttemptAt: date, lastAttemptAt: date, leaseExpiresAt: null, sentAt: null, lastErrorCode: "provider_error" }],
  history: [], historyHasMore: false
};
const paidDraft: RegistrationDraft = { ...emptyRegistrationDraft, action: RegistrationAction.MarkPaid, open: true,
  expectedUpdatedAt: date.toISOString(), paymentMethod: "bank", amount: 650000, payerName: "Alice", transactionReference: "BANK-123" };
function find(node: ReactNode, type: unknown, label?: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === type && (!label || child.props.children === label)) return child;
    const result = find(child.props.children as ReactNode, type, label);
    if (result) return result;
  }
}
function actionTree(registration = record, draft = paidDraft, setDraft = vi.fn()) {
  let result: ReactElement;
  function Capture() {
    result = RegistrationActions({ registration, draft, setDraft, onAccessError: harness.accessError, onChanged: harness.changed });
    return result;
  }
  renderToStaticMarkup(createElement(Capture));
  return result!;
}
const submit = (tree: ReactNode) => (find(tree, "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
const formHtml = (tree: ReactNode) => renderToStaticMarkup(createElement(Dialog, { open: true }, find(tree, "form")!));
const render = () => renderToStaticMarkup(createElement(Route.options.component as ComponentType));
beforeEach(() => {
  vi.clearAllMocks(); harness.pending = false; harness.mutationError = null;
  harness.result = { data: structuredClone(record), isPending: false, isError: false, isFetching: false, error: null, refetch: harness.refetch };
  harness.older = { ...harness.result };
});

describe("Registration detail", () => {
  it("shows submitted information, run context and read-only email state with safe text", () => {
    const html = render();
    for (const text of ["AD-PSW-0001", "alice@example.invalid", "Sales manager", "Prefer not to say", "Consent recorded",
      "Practical Selling", "Training Room", "Manila time", "₱6,500", "Payment has not been verified", "Payment information", "Attempt failed"])
      expect(html).toContain(text);
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe</script>");
    expect(html).toContain("Retry payment information");
    expect(html).toContain('href="/registrations/sessions/$sessionId"');
    expect(html).toContain("&quot;tab&quot;:&quot;overview&quot;");
    expect(html.match(/href="\/registrations\/sessions\/\$sessionId"/g)).toHaveLength(1);
    expect(html).not.toContain('href="/registrations"');
    expect(html).toContain("Back to workshop overview");
    expect(html).toContain("&quot;offset&quot;:50");
    expect(html).toContain("&quot;runOffset&quot;:100");
  });
  it("retains previous verification after correction and shows cancellation reason without actions", () => {
    harness.result.data = { ...record, paymentMethod: "bank", paidAmountCentavos: 0, payerName: "Alice", providerTransactionReference: "BANK-123",
      verifiedAt: date, verifiedBy: "staff", verifiedByName: "Sample Staff", cancelledAt: date, cancelledBy: "staff",
      cancelledByName: "Sample Staff", cancellationReason: "Customer requested cancellation",
      history: [{ id: "audit-1", action: "status_change", createdAt: date,
        changes: { actor: { from: null, to: { id: "staff", name: "Sample Staff", email: "staff@example.invalid" } } } }] };
    const html = render();
    for (const text of ["previous verification is retained", "Cancelled", "Customer requested cancellation", "Bank transfer", "₱0", "BANK-123", "Sample Staff", "does not reserve a seat"])
      expect(html).toContain(text);
    expect(html).not.toContain(">Mark Paid<"); expect(html).not.toContain(">Correct to Unpaid<"); expect(html).not.toContain(">Cancel registration<");
  });
  it.each([0, 20])("shows staff names independently of history at offset %s", offset => {
    harness.result.data = { ...record, verifiedAt: date, verifiedBy: "verifier", verifiedByName: "Payment Verifier",
      cancelledAt: date, cancelledBy: "canceller", cancelledByName: "Registration Canceller", history: [], historyHasMore: true };
    harness.older.data = { ...record, history: [], historyHasMore: false };
    vi.mocked(useState).mockReturnValueOnce([offset, vi.fn()]);
    const html = render();
    expect(html).toContain('Verified by</dt><dd class="mt-1 whitespace-pre-wrap break-words">Payment Verifier');
    expect(html).toContain('Cancelled by</dt><dd class="mt-1 whitespace-pre-wrap break-words">Registration Canceller');
    expect(html).not.toContain("Staff identity not available");
  });
  it("shows a fallback when staff names are unavailable", () => {
    harness.result.data = { ...record, verifiedAt: date, cancelledAt: date };
    expect(render().match(/Staff identity not available/g)).toHaveLength(2);
  });
  it("loads older history independently and limits ordinary failures to the history section", () => {
    harness.older.isError = true; harness.older.error = new Error("crm_unavailable");
    vi.mocked(useState).mockReturnValueOnce([20, vi.fn()]);
    const html = render();
    expect(html).toContain("alice@example.invalid"); expect(html).toContain("Try again");
    expect(html).not.toContain("No staff actions on this history page");
    expect(harness.query.mock.calls[0][0].queryKey).toEqual(["workshop-registrations", "detail", record.id, 0]);
    expect(harness.query.mock.calls[1][0]).toMatchObject({ enabled: true, queryKey: ["workshop-registrations", "detail", record.id, 20] });
  });
  it("hides the entire detail when an older history request loses staff access", () => {
    harness.older.isError = true; harness.older.error = new Error("staff_access_required");
    vi.mocked(useState).mockReturnValueOnce([20, vi.fn()]);
    const html = render();
    expect(html).toContain("Registration access unavailable");
    expect(html).not.toContain("alice@example.invalid");
  });
  it("hides cached details on failures and renders loading/missing/access states safely", () => {
    harness.result.data = undefined; harness.result.isPending = true;
    expect(render()).toContain("Loading registration");
    harness.result.isPending = false; harness.result.data = record; harness.result.isError = true;
    for (const [code, text] of [["registration_not_found", "This registration could not be found"], ["staff_access_required", "Registration access unavailable"],
      ["private database details", "The request could not be completed"]]) {
      harness.result.error = new Error(code);
      const html = render();
      expect(html).toContain(text); expect(html).not.toContain("alice@example.invalid"); expect(html).not.toContain("private database details");
    }
  });
});

describe("Registration actions", () => {
  it.each([
    [RegistrationAction.MarkPaid, "Mark Paid", "Confirm only after checking the actual funds.", "Registration marked Paid. Check email delivery separately."],
    [RegistrationAction.CorrectPayment, "Correct to Unpaid", "Correct a mistaken payment verification.", "Payment corrected to Unpaid. The seat remains reserved."],
    [RegistrationAction.Cancel, "Cancel registration", "This cancels the unpaid registration and releases its reserved seat.", "Registration cancelled. Its seat has been released."]
  ] as const)("uses the matching confirmation and success message for %s", async (action, label, description, message) => {
    const isPaid = action === RegistrationAction.CorrectPayment;
    const tree = actionTree({ ...record, isPaid }, { ...paidDraft, action, expectedIsPaid: isPaid });
    expect(find(tree, Button, label)).toBeDefined();
    expect(formHtml(tree)).toContain(description);
    await harness.mutation.onSuccess({}, { action });
    expect(harness.toast).toHaveBeenCalledWith(message);
  });
  it("offers actions only for the current state and leaves payment inputs blank on opening", () => {
    for (const [registration, expected] of [[record, ["Mark Paid", "Cancel registration"]], [{ ...record, isPaid: true }, ["Correct to Unpaid"]],
      [{ ...record, cancelledAt: date }, []]] as const) {
      const tree = actionTree(registration, emptyRegistrationDraft);
      for (const label of ["Mark Paid", "Cancel registration", "Correct to Unpaid"]) expect(!!find(tree, Button, label)).toBe(new Set<string>(expected).has(label));
    }
    const setDraft = vi.fn();
    const tree = actionTree(record, emptyRegistrationDraft, setDraft);
    (find(tree, Button, "Mark Paid")!.props.onClick as (event: unknown) => void)({ currentTarget: null });
    const update = setDraft.mock.calls[0][0] as (current: RegistrationDraft) => RegistrationDraft;
    expect(update(emptyRegistrationDraft)).toMatchObject({ action: RegistrationAction.MarkPaid, open: true,
      expectedIsPaid: false, expectedUpdatedAt: date.toISOString(), amount: null, payerName: "", transactionReference: "", paymentMethod: "" });
  });
  it("validates payment data, requires an explicit amount and allows zero", () => {
    const setDraft = vi.fn();
    submit(actionTree(record, { ...paidDraft, amount: null }, setDraft));
    expect(harness.mutate).not.toHaveBeenCalled(); expect(setDraft).toHaveBeenCalled();
    for (const amount of [650000, 0]) {
      submit(actionTree(record, { ...paidDraft, amount }));
      expect(harness.mutate).toHaveBeenLastCalledWith({ id: record.id, action: RegistrationAction.MarkPaid, expectedIsPaid: false,
        expectedUpdatedAt: date.toISOString(), paymentMethod: "bank", paidAmountCentavos: amount, payerName: "Alice", providerTransactionReference: "BANK-123" });
    }
    harness.mutate.mockClear();
    for (const patch of [{ paymentMethod: "" as const }, { payerName: " " }, { transactionReference: "" }, { amount: -1 }]) submit(actionTree(record, { ...paidDraft, ...patch }));
    expect(harness.mutate).not.toHaveBeenCalled();
  });
  it("requires reasons for cancellation and correction and sends the reviewed version", () => {
    for (const action of [RegistrationAction.Cancel, RegistrationAction.CorrectPayment]) {
      const isPaid = action === RegistrationAction.CorrectPayment;
      const registration = { ...record, isPaid };
      const draft = { ...paidDraft, action, expectedIsPaid: isPaid, reason: " " };
      harness.mutate.mockClear(); submit(actionTree(registration, draft)); expect(harness.mutate).not.toHaveBeenCalled();
      submit(actionTree(registration, { ...draft, reason: "  Reviewed correction  " }));
      expect(harness.mutate).toHaveBeenCalledWith({ id: record.id, action, expectedIsPaid: isPaid, expectedUpdatedAt: date.toISOString(), reason: "Reviewed correction" });
    }
  });
  it("blocks timestamp changes even after a Paid-to-Unpaid round trip, cancelled records and pending submissions", () => {
    for (const [registration, draft] of [[{ ...record, updatedAt: new Date(date.getTime() + 1) }, paidDraft],
      [{ ...record, isPaid: true }, paidDraft], [{ ...record, cancelledAt: date }, paidDraft], [record, { ...paidDraft, needsReview: true }]] as const) {
      const tree = actionTree(registration, draft);
      submit(tree); expect(harness.mutate).not.toHaveBeenCalled();
      expect(formHtml(tree)).toContain("Your input has been kept");
    }
    harness.pending = true;
    const tree = actionTree(); submit(tree); expect(harness.mutate).not.toHaveBeenCalled();
    expect(find(tree, Button, "Saving…")!.props.disabled).toBe(true);
    expect(find(tree, Button, "Cancel registration")!.props.disabled).toBe(true);
  });
  it("blocks duplicate submissions and keeps the reviewed draft until explicit close/reopening", () => {
    const tree = actionTree(); submit(tree); submit(tree);
    expect(harness.mutate).toHaveBeenCalledOnce();
    harness.mutation.onSettled(); submit(tree);
    expect(harness.mutate).toHaveBeenCalledTimes(2);
    const setDraft = vi.fn();
    const stale = actionTree({ ...record, updatedAt: new Date(date.getTime() + 1) }, paidDraft, setDraft);
    expect(formHtml(stale)).toContain("Close this dialog, review the latest record and reopen");
    (find(stale, Button, "Close")!.props.onClick as () => void)();
    const closed = setDraft.mock.calls[0][0](paidDraft) as RegistrationDraft;
    expect(closed).toMatchObject({ open: false, amount: 650000, expectedUpdatedAt: date.toISOString() });
    const fresh = { ...record, updatedAt: new Date(date.getTime() + 1) };
    const reopened = actionTree(fresh, closed, setDraft);
    (find(reopened, Button, "Mark Paid")!.props.onClick as (event: unknown) => void)({ currentTarget: null });
    expect(setDraft.mock.calls[1][0](closed)).toMatchObject({ open: true, amount: 650000, expectedUpdatedAt: fresh.updatedAt.toISOString(), needsReview: false });
  });
  it("refreshes every registration view on success without claiming email delivery", async () => {
    const setDraft = vi.fn(); actionTree(record, paidDraft, setDraft);
    expect(harness.mutation.retry).toBe(false);
    await harness.mutation.mutationFn({ id: record.id, action: RegistrationAction.MarkPaid });
    expect(harness.change).toHaveBeenCalledWith({ data: { id: record.id, action: RegistrationAction.MarkPaid } });
    await harness.mutation.onSuccess({ isPaid: true }, { action: RegistrationAction.MarkPaid });
    expect(setDraft).toHaveBeenCalledWith(emptyRegistrationDraft);
    expect(harness.changed).toHaveBeenCalledOnce();
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: registrationQueryKey });
    expect(harness.toast).toHaveBeenCalledWith("Registration marked Paid. Check email delivery separately.");
  });
  it("retains drafts after network errors, requires review on conflicts and escalates access loss", async () => {
    const setDraft = vi.fn(); harness.mutationError = new Error("crm_unavailable");
    const tree = actionTree(record, paidDraft, setDraft);
    expect(formHtml(tree)).toContain("BANK-123");
    await harness.mutation.onError(harness.mutationError);
    expect(setDraft).not.toHaveBeenCalled();
    await harness.mutation.onError(new Error("registration_status_changed"));
    expect(setDraft.mock.calls[0][0](paidDraft)).toMatchObject({ needsReview: true, amount: 650000 });
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: registrationQueryKey });
    const denied = new Error("staff_access_required"); await harness.mutation.onError(denied);
    expect(harness.accessError).toHaveBeenCalledWith(denied);
  });
});

it("forwards the detail ID, history window and abort signal without retaining the CRM cache", async () => {
  const options = registrationQueryOptions(record.id);
  const signal = new AbortController().signal;
  if (typeof options.queryFn !== "function") throw new Error("Missing query function");
  await options.queryFn({ client: new QueryClient(), queryKey: options.queryKey, signal, meta: undefined });
  expect(harness.get).toHaveBeenCalledWith({ data: { id: record.id, limit: 20, offset: 0 }, signal });
  expect(options).toMatchObject({ retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000 });
});
