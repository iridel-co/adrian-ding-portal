import { Children, createElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  selected: null as string | null, setSelected: vi.fn(), pending: false, error: null as Error | null,
  options: {} as Record<string, Function>, mutate: vi.fn(), reset: vi.fn(), invalidate: vi.fn(), changed: vi.fn(), denied: vi.fn(),
  retry: vi.fn(), success: vi.fn(), info: vi.fn()
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: object) => options,
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
  useMutation: (options: Record<string, Function>) => {
    harness.options = options;
    return { isPending: harness.pending, error: harness.error, mutate: harness.mutate, reset: harness.reset };
  }
}));
vi.mock("./functions", () => ({ $retryRegistrationEmail: harness.retry, $changeRegistration: vi.fn(), $getRegistration: vi.fn(),
  $getRegistrationSession: vi.fn(), $listRegistrations: vi.fn(), $listRegistrationSessions: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: harness.success, info: harness.info } }));
import { RegistrationEmails } from "@/components/crm/registration-emails";
import { RegistrationHistory } from "@/components/crm/registration-history";
import { Button } from "@/components/ui/button";
import { CrmEmailKind } from "@/db/schema/crm-email-kind";
import { CrmEmailState } from "@/db/schema/crm-email-state";
import { canRetryRegistrationEmail, registrationEmailErrorMessage } from "./registration-presentation";
import { registrationQueryKey } from "./registration-queries";
import type { $getRegistration } from "./functions";

type Registration = Awaited<ReturnType<typeof $getRegistration>>;
type Job = Registration["emailJobs"][number];
type Owner = Pick<Registration, "id" | "isPaid" | "cancelledAt" | "emailJobs">;
const now = Date.now();
const date = new Date("2026-10-19T01:00:00Z");
const job: Job = { id: "email-1", kind: CrmEmailKind.PaymentInstructions, state: CrmEmailState.Failed, attemptCount: 1,
  firstAttemptAt: date, lastAttemptAt: date, sentAt: null, leaseExpiresAt: null, lastErrorCode: null };
const owner: Owner = { id: "registration-1", isPaid: false, cancelledAt: null, emailJobs: [job] };
function find(node: ReactNode, type: unknown, label?: string): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === type && (!label || Children.toArray(child.props.children as ReactNode).join("") === label)) return child;
    const result = find(child.props.children as ReactNode, type, label);
    if (result) return result;
  }
}
function emailTree(registration = owner) {
  let result: ReactElement;
  function Capture() {
    vi.mocked(useState).mockReturnValueOnce([harness.selected, harness.setSelected]);
    result = RegistrationEmails({ registration, onChanged: harness.changed, onAccessError: harness.denied });
    return result;
  }
  renderToStaticMarkup(createElement(Capture));
  return result!;
}
const html = (registration = owner) => renderToStaticMarkup(emailTree(registration));
const click = (tree: ReactNode, label: string) => (find(tree, Button, label)!.props.onClick as (event: unknown) => void)({ currentTarget: null });
beforeEach(() => {
  vi.clearAllMocks(); harness.selected = null; harness.pending = false; harness.error = null;
});

describe("Workshop email retry eligibility", () => {
  it("allows only matching payment states, active registrations and workshop email kinds", () => {
    for (const kind of Object.values(CrmEmailKind)) for (const state of Object.values(CrmEmailState)) {
      for (const isPaid of [false, true]) for (const cancelledAt of [null, date]) {
        const expected = !cancelledAt && [CrmEmailState.Pending, CrmEmailState.Failed].some(value => value === state)
          && (kind === CrmEmailKind.PaymentInstructions && !isPaid || kind === CrmEmailKind.PaymentAcknowledgment && isPaid);
        expect(canRetryRegistrationEmail({ ...job, kind, state, leaseExpiresAt: state === CrmEmailState.Sending ? new Date(now + 60000) : null }, { isPaid, cancelledAt }, now)).toBe(expected);
      }
    }
  });
  it("blocks live send leases and allows recovery only at or after expiry", () => {
    const sending = { ...job, state: CrmEmailState.Sending };
    expect(canRetryRegistrationEmail({ ...sending, leaseExpiresAt: new Date(now + 1000) }, owner, now)).toBe(false);
    for (const leaseExpiresAt of [new Date(now), new Date(now - 1000)]) expect(canRetryRegistrationEmail({ ...sending, leaseExpiresAt }, owner, now)).toBe(true);
    expect(canRetryRegistrationEmail({ ...sending, leaseExpiresAt: date }, { ...owner, cancelledAt: date }, now)).toBe(false);
  });
});

describe("Registration email controls", () => {
  it("shows bounded delivery metadata and payment-aware controls without exposing job identifiers", () => {
    const markup = html();
    for (const text of ["Payment information", "Attempt failed", "Attempts", "Last attempt", "Accepted by provider", "Retry payment information", "Manila"]) expect(markup).toContain(text);
    expect(markup).not.toContain("email-1");
    expect(html({ ...owner, emailJobs: [] })).toContain("No email jobs recorded");
    expect(html({ ...owner, isPaid: true })).not.toContain(">Retry payment information<");
    const paused = html({ ...owner, emailJobs: [{ ...job, kind: CrmEmailKind.PaymentAcknowledgment }] });
    expect(paused).toContain("wait until the registration is Paid again");
    expect(paused).toContain("Attempt failed");
    expect(paused).not.toContain(">Retry payment acknowledgment<");
    const cancelled = html({ ...owner, cancelledAt: date });
    expect(cancelled).toContain("No further email attempts");
    expect(cancelled).not.toContain(">Retry payment information<");
  });
  it.each([
    ["provider_request_failed", "delivery outcome may be uncertain"],
    ["provider_rejected", "provider rejected the attempt"],
    ["provider_throttled", "wait before retrying"],
    ["provider_response_invalid", "unexpected response"],
    ["provider_conflict", "conflicting request"],
    ["idempotency_window_expired", "safe retry period has ended"],
    ["payment_instructions_obsolete", "Payment information is no longer applicable"],
    ["payment_acknowledgment_obsolete", "acknowledgment is no longer applicable"],
    ["unknown_private_code", "last attempt needs review"]
  ])("explains saved delivery code %s safely", (lastErrorCode, message) => {
    const markup = html({ ...owner, emailJobs: [{ ...job, lastErrorCode }] });
    expect(markup).toContain(message);
    expect(markup).not.toContain(lastErrorCode);
  });
  it("shows reconciliation and in-progress explanations without retry controls", () => {
    for (const state of [CrmEmailState.Sent, CrmEmailState.Skipped, CrmEmailState.NeedsReconciliation, CrmEmailState.Sending]) {
      const markup = html({ ...owner, emailJobs: [{ ...job, state, leaseExpiresAt: new Date(Date.now() + 60000) }] });
      expect(markup).not.toContain(">Retry payment information<");
      if (state === CrmEmailState.NeedsReconciliation) expect(markup).toContain("check the provider outside this screen");
      if (state === CrmEmailState.Sending) expect(markup).toContain("An attempt is still in progress");
    }
  });
  it("rechecks eligibility when opening and submitting, and blocks duplicate/pending attempts", () => {
    const tree = emailTree(); click(tree, "Retry payment information");
    expect(harness.setSelected).toHaveBeenCalledWith(job.id);
    expect(harness.mutate).not.toHaveBeenCalled();
    harness.selected = job.id;
    const confirmation = emailTree(); click(confirmation, "Confirm retry"); click(confirmation, "Confirm retry");
    expect(harness.mutate).toHaveBeenCalledOnce(); expect(harness.mutate).toHaveBeenCalledWith(job.id);
    for (const registration of [{ ...owner, isPaid: true }, { ...owner, cancelledAt: date },
      { ...owner, emailJobs: [{ ...job, state: CrmEmailState.Sent }] }, { ...owner, emailJobs: [] }]) {
      harness.mutate.mockClear();
      const unavailable = emailTree(registration); click(unavailable, "Confirm retry");
      expect(harness.mutate).not.toHaveBeenCalled(); expect(find(unavailable, Button, "Confirm retry")!.props.disabled).toBe(true);
    }
    harness.pending = true;
    const pending = emailTree(); click(pending, "Attempting…");
    expect(harness.mutate).not.toHaveBeenCalled();
  });
  it("uses the original IDs with no automatic retries and reports the returned state", async () => {
    emailTree(); expect(harness.options.retry).toBe(false);
    await harness.options.mutationFn(job.id);
    expect(harness.retry).toHaveBeenCalledWith({ data: { registrationId: owner.id, jobId: job.id } });
    await harness.options.onSuccess({ ...job, state: CrmEmailState.Sent });
    expect(harness.success).toHaveBeenCalledWith("Email accepted by the provider. Inbox delivery is not confirmed.");
    expect(harness.changed).toHaveBeenCalledOnce(); expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: registrationQueryKey });
    harness.success.mockClear();
    await harness.options.onSuccess({ ...job, state: CrmEmailState.NeedsReconciliation });
    expect(harness.success).not.toHaveBeenCalled();
    expect(harness.info).toHaveBeenCalledWith(expect.stringContaining("Needs manual reconciliation"));
    await harness.options.onSuccess({ ...job, state: CrmEmailState.Failed });
    expect(harness.info).toHaveBeenCalledWith(expect.stringContaining("Attempt failed"));
  });
  it("handles disabled sending, stale/ownership failures, and revoked access safely", async () => {
    emailTree();
    expect(registrationEmailErrorMessage(new Error("email_unavailable"))).toContain("Payment status has not changed");
    expect(registrationEmailErrorMessage(new Error("private provider details"))).not.toContain("private provider details");
    for (const code of ["email_not_retryable", "email_job_not_found"]) await harness.options.onError(new Error(code));
    expect(harness.invalidate).toHaveBeenCalledTimes(2);
    const error = new Error("staff_access_required"); await harness.options.onError(error);
    expect(harness.denied).toHaveBeenCalledWith(error);
  });
});

const entries: Registration["history"] = [
  { id: "h1", action: "status_change", createdAt: date, changes: { actor: { from: null, to: { id: "staff", name: "Sample Staff", email: "staff@example.invalid" } },
    isPaid: { from: false, to: true }, paymentMethod: { from: null, to: "gcash" }, paidAmountCentavos: { from: null, to: 0 },
    payerName: { from: null, to: "Alice <script>unsafe</script>" }, providerTransactionReference: { from: null, to: "GC-123" }, verifiedAt: { from: null, to: date.toISOString() } } },
  { id: "h2", action: "status_change", createdAt: date, changes: { isPaid: { from: true, to: false }, reason: { from: null, to: "Payment verified by mistake" } } },
  { id: "h3", action: "status_change", createdAt: date, changes: { cancelledAt: { from: null, to: date.toISOString() }, cancellationReason: { from: null, to: "Customer cancelled" } } },
  { id: "h4", action: "update", createdAt: date, changes: { emailRetry: { from: { jobId: job.id, state: CrmEmailState.Failed, attemptCount: 1 }, to: { jobId: job.id, state: CrmEmailState.Sending, attemptCount: 2 } } } }
];
function historyTree(patch: Partial<Parameters<typeof RegistrationHistory>[0]> = {}) {
  const props = { entries, offset: 0, hasMore: true, pending: false, fetching: false, error: null, retry: vi.fn(), onPage: vi.fn(), ...patch };
  let result: ReactElement;
  function Capture() { result = RegistrationHistory(props); return result; }
  renderToStaticMarkup(createElement(Capture));
  return { tree: result!, props };
}
describe("Registration history", () => {
  it("renders readable payment changes, verification details, reasons and retry claims", () => {
    const markup = renderToStaticMarkup(historyTree().tree);
    for (const text of ["Marked Paid", "Corrected to Unpaid", "Registration cancelled", "Email retry attempt recorded", "Sample Staff",
      "Unpaid → Paid", "Paid → Unpaid", "GCash", "₱0", "GC-123", "Payment verified by mistake", "Customer cancelled", "Attempt 2 recorded", "does not confirm delivery"])
      expect(markup).toContain(text);
    expect(markup).toContain("&lt;script&gt;unsafe&lt;/script&gt;"); expect(markup).not.toContain("<script>unsafe</script>");
    expect(markup).not.toContain("email-1");
  });
  it("paginates by 20 and disables boundaries and pending controls", () => {
    const page = historyTree({ offset: 20 }); click(page.tree, "Newer history");
    expect(page.props.onPage).toHaveBeenLastCalledWith(0); click(page.tree, "Older history"); expect(page.props.onPage).toHaveBeenLastCalledWith(40);
    expect(find(historyTree().tree, Button, "Newer history")!.props.disabled).toBe(true);
    for (const patch of [{ hasMore: false }, { offset: 100000 }, { fetching: true }]) expect(find(historyTree(patch).tree, Button, "Older history")!.props.disabled).toBe(true);
  });
  it("keeps loading/errors distinct from empty history and hides failed cached entries", () => {
    expect(renderToStaticMarkup(historyTree({ pending: true }).tree)).toContain("Loading registration history");
    expect(renderToStaticMarkup(historyTree({ entries: [] }).tree)).toContain("No staff actions on this history page");
    const markup = renderToStaticMarkup(historyTree({ error: new Error("crm_unavailable") }).tree);
    expect(markup).toContain("Try again"); expect(markup).not.toContain("Sample Staff"); expect(markup).not.toContain("No staff actions on this history page");
  });
});
