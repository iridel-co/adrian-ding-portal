import { Children, createElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ change: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock("./functions", () => ({ $changeRegistration: harness.change }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: harness.invalidate }) }));
vi.mock("sonner", () => ({ toast: { success: harness.toast } }));
import { RegistrationBatchDialog, type RegistrationRow, type BatchAction } from "@/components/crm/registration-batch-dialog";
import { emptyRegistrationDraft, type RegistrationDraft } from "./registration-presentation";
import { registrationQueryKey } from "./registration-queries";
import { RegistrationAction } from "./registration-staff-schemas";

const items = [1, 2, 3].map(number => ({ id: `12345678-abcd-4000-8000-123456789ab${number}`,
  reference: `AD-PSW-000${number}`, fullName: `Registrant ${number}`, email: `r${number}@example.invalid`,
  phone: "123", priceCentavos: 10000, isPaid: false, cancelledAt: null,
  createdAt: new Date("2026-10-19T00:00:00Z"), updatedAt: new Date("2026-10-19T00:00:00Z") } satisfies RegistrationRow));
const drafts: RegistrationDraft[] = items.map(item => ({ ...emptyRegistrationDraft, expectedUpdatedAt: item.updatedAt.toISOString(),
  paymentMethod: "bank" as const, amount: 10000, payerName: item.fullName, transactionReference: `TX-${item.id}` }));
type FormProps = { children?: ReactNode; onSubmit: (event: { preventDefault: () => void }) => Promise<void> };
function find(node: ReactNode): ReactElement<FormProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<FormProps>(child)) continue;
    if (child.type === "form") return child;
    const result = find(child.props.children);
    if (result) return result;
  }
}

function form(action: BatchAction = RegistrationAction.MarkPaid, values = drafts) {
  const setError = vi.fn();
  vi.mocked(useState).mockReturnValueOnce([values, vi.fn()]).mockReturnValueOnce(["Customer request", vi.fn()])
    .mockReturnValueOnce([false, vi.fn()]).mockReturnValueOnce(["", setError]);
  const close = vi.fn();
  let tree: ReactElement;
  function Capture() {
    tree = RegistrationBatchDialog({ items, action, onClose: close, onCloseFocus: vi.fn() });
    return tree;
  }
  renderToStaticMarkup(createElement(Capture));
  return { submit: () => find(tree!)!.props.onSubmit({ preventDefault() {} }), setError, close };
}
beforeEach(() => { vi.clearAllMocks(); harness.change.mockReset(); harness.invalidate.mockResolvedValue(undefined); });

it("validates every payment before saving any registration", async () => {
  const values = drafts.map(draft => ({ ...draft }));
  values[1].amount = null;
  const current = form(RegistrationAction.MarkPaid, values);
  await current.submit();
  expect(harness.change).not.toHaveBeenCalled();
  expect(current.setError).toHaveBeenCalledWith(expect.stringContaining(items[1].reference));
});
it("saves individual verified payments once and refreshes registration queries", async () => {
  let finish!: () => void;
  harness.change.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const current = form();
  const saving = current.submit();
  await current.submit();
  expect(harness.change).toHaveBeenCalledTimes(1);
  finish();
  await saving;
  expect(harness.change).toHaveBeenCalledTimes(3);
  expect(harness.change.mock.calls[1][0].data).toMatchObject({ id: items[1].id, action: "mark_paid",
    expectedIsPaid: false, paidAmountCentavos: 10000, payerName: items[1].fullName, providerTransactionReference: drafts[1].transactionReference });
  expect(current.close).toHaveBeenCalledOnce();
  expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: registrationQueryKey });
});
it("stops a partially completed batch and identifies the record to review", async () => {
  harness.change.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("registration_status_changed"));
  const current = form();
  await current.submit();
  expect(harness.change).toHaveBeenCalledTimes(2);
  expect(current.close).not.toHaveBeenCalled();
  expect(current.setError).toHaveBeenLastCalledWith(expect.stringContaining(`1 of 3 saved. Stopped at ${items[1].reference}`));
  expect(harness.invalidate).toHaveBeenCalled();
});
it("records the shared cancellation reason for each selected registration", async () => {
  const current = form(RegistrationAction.Cancel);
  await current.submit();
  expect(harness.change).toHaveBeenCalledTimes(3);
  expect(harness.change.mock.calls[2][0].data).toEqual({ id: items[2].id, action: "cancel", expectedIsPaid: false,
    expectedUpdatedAt: items[2].updatedAt.toISOString(), reason: "Customer request" });
});
