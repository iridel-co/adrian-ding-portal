import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { MoneyField } from "@/components/cms/money-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { paymentMethod } from "@/db/schema/payments";
import { IntakeErrorCode } from "@/features/crm/errors";
import { $changeRegistration, type $getRegistration } from "@/features/crm/functions";
import { formatInquiryTime, isInquiryAccessError } from "@/features/crm/presentation";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationQueryKey } from "@/features/crm/registration-queries";
import { RegistrationAction, registrationActionSchema } from "@/features/crm/registration-staff-schemas";
import { formatPesos } from "@/features/shared/money";

export type RegistrationDraft = {
  action: RegistrationAction | null; open: boolean; expectedIsPaid: boolean; expectedUpdatedAt: string;
  paymentMethod: typeof paymentMethod.enumValues[number] | ""; amount: number | null;
  payerName: string; transactionReference: string; reason: string; validation: string; needsReview: boolean;
};
export const emptyRegistrationDraft: RegistrationDraft = {
  action: null, open: false, expectedIsPaid: false, expectedUpdatedAt: "", paymentMethod: "", amount: null,
  payerName: "", transactionReference: "", reason: "", validation: "", needsReview: false
};
const actionLabels = {
  [RegistrationAction.MarkPaid]: "Mark Paid",
  [RegistrationAction.CorrectPayment]: "Correct to Unpaid",
  [RegistrationAction.Cancel]: "Cancel registration"
};
export const paymentMethodLabels: Record<typeof paymentMethod.enumValues[number], string> = { bank: "Bank transfer", gcash: "GCash", maya: "Maya" };
type Registration = Awaited<ReturnType<typeof $getRegistration>>;

export function RegistrationActions({ registration, draft, setDraft, onAccessError }: {
  registration: Registration; draft: RegistrationDraft; setDraft: Dispatch<SetStateAction<RegistrationDraft>>;
  onAccessError: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  const updateDraft = (patch: Partial<RegistrationDraft>) => setDraft(current => ({ ...current, ...patch }));
  const change = useMutation({
    mutationFn: (data: Parameters<typeof $changeRegistration>[0]["data"]) => $changeRegistration({ data }),
    retry: false,
    onSuccess: async (_result, input) => {
      setDraft(emptyRegistrationDraft);
      toast.success(input.action === RegistrationAction.MarkPaid ? "Registration marked Paid. Check email delivery separately."
        : input.action === RegistrationAction.Cancel ? "Registration cancelled. Its seat has been released." : "Payment corrected to Unpaid. The seat remains reserved.");
      await queryClient.invalidateQueries({ queryKey: registrationQueryKey });
    },
    onError: async error => {
      if (isInquiryAccessError(error)) { onAccessError(error); return; }
      if ([IntakeErrorCode.RegistrationStatusChanged, IntakeErrorCode.RegistrationCancelled].some(code => code === error.message)) {
        updateDraft({ needsReview: true });
        await queryClient.invalidateQueries({ queryKey: registrationQueryKey });
      }
    },
    onSettled: () => { submitting.current = false; }
  });
  const allowed = registration.cancelledAt ? [] : registration.isPaid
    ? [RegistrationAction.CorrectPayment] : [RegistrationAction.MarkPaid, RegistrationAction.Cancel];
  const stale = !!registration.cancelledAt || draft.needsReview || draft.expectedIsPaid !== registration.isPaid
    || draft.expectedUpdatedAt !== new Date(registration.updatedAt).toISOString();
  const available = draft.action !== null && allowed.includes(draft.action);
  const markPaid = draft.action === RegistrationAction.MarkPaid;
  const close = () => { if (!submitting.current && !change.isPending) updateDraft({ open: false }); };
  return <section ref={section} tabIndex={-1} className="space-y-3" aria-label="Registration actions">
    <h2 className="text-xl font-medium">Manage registration</h2>
    <div className="flex flex-wrap gap-2">{allowed.map(action => <Button key={action}
      variant={action === RegistrationAction.Cancel ? "destructive" : "outline"} disabled={change.isPending}
      onClick={event => {
        opener.current = event.currentTarget;
        updateDraft({ ...(draft.action === action ? {} : emptyRegistrationDraft), action, open: true,
          expectedIsPaid: registration.isPaid, expectedUpdatedAt: new Date(registration.updatedAt).toISOString(), validation: "", needsReview: false });
        change.reset();
      }}>{actionLabels[action]}</Button>)}</div>
    {registration.cancelledAt && <p className="text-sm text-muted-foreground">This registration is cancelled. No payment or cancellation actions are available.</p>}
    <Dialog open={draft.open} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={!change.isPending}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const target = opener.current?.isConnected && !opener.current.disabled ? opener.current : section.current;
          target?.focus();
        }}>
        <form className="space-y-5" onSubmit={event => {
          event.preventDefault();
          if (!draft.action || stale || !available || submitting.current || change.isPending) return;
          const parsed = registrationActionSchema.safeParse({ id: registration.id, action: draft.action,
            expectedIsPaid: draft.expectedIsPaid, expectedUpdatedAt: draft.expectedUpdatedAt,
            ...(markPaid ? { paymentMethod: draft.paymentMethod, paidAmountCentavos: draft.amount,
              payerName: draft.payerName, providerTransactionReference: draft.transactionReference } : { reason: draft.reason }) });
          if (!parsed.success) { updateDraft({ validation: markPaid ? "Complete all payment fields. Enter the verified amount, including zero for a free registration." : "Enter a reason before confirming this action." }); return; }
          updateDraft({ validation: "" }); submitting.current = true; change.mutate(parsed.data);
        }}>
          <DialogHeader><DialogTitle>{draft.action ? actionLabels[draft.action] : "Manage registration"}</DialogTitle>
            <DialogDescription>{markPaid ? "Confirm only after checking the actual funds. This records payment and queues the payment acknowledgment. Email delivery is separate from payment confirmation."
              : draft.action === RegistrationAction.Cancel ? "This cancels the unpaid registration and releases its reserved seat. The record and reason will remain available. No cancellation email is sent."
              : "Correct a mistaken payment verification. The seat and previous verification details remain. This is not a refund, and an email already sent cannot be recalled."}</DialogDescription></DialogHeader>
          <fieldset disabled={change.isPending} className="space-y-4">
            {markPaid ? <>
              <p className="text-sm">Saved registration price: {formatPesos(registration.priceCentavos)}</p>
              <div className="space-y-2"><Label htmlFor="registration-payment-method">Payment method</Label>
                <Select required value={draft.paymentMethod} onValueChange={value => {
                  const method = paymentMethod.enumValues.find(method => method === value);
                  if (method) updateDraft({ paymentMethod: method });
                }}>
                  <SelectTrigger id="registration-payment-method"><SelectValue placeholder="Select payment method" /></SelectTrigger>
                  <SelectContent>{paymentMethod.enumValues.map(method => <SelectItem key={method} value={method}>{paymentMethodLabels[method]}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-2"><Label htmlFor="registration-paid-amount">Verified amount in pesos</Label>
                <MoneyField key={`${registration.id}-${draft.expectedUpdatedAt}`} id="registration-paid-amount" value={draft.amount} onChange={amount => updateDraft({ amount })} /></div>
              <div className="space-y-2"><Label htmlFor="registration-payer-name">Payer name</Label>
                <Input id="registration-payer-name" value={draft.payerName} required maxLength={200} onChange={event => updateDraft({ payerName: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="registration-transaction-reference">Provider transaction reference</Label>
                <Input id="registration-transaction-reference" value={draft.transactionReference} required maxLength={200} onChange={event => updateDraft({ transactionReference: event.target.value })} /></div>
            </> : <div className="space-y-2"><Label htmlFor="registration-action-reason">Reason</Label>
              <Textarea id="registration-action-reason" value={draft.reason} required maxLength={2000} onChange={event => updateDraft({ reason: event.target.value })} /></div>}
          </fieldset>
          {(draft.validation || change.error) && <p role="alert" className="text-sm text-destructive">{draft.validation || registrationErrorMessage(change.error)}</p>}
          {stale && <p role="alert" className="text-sm">The record changed. Its latest state is {registration.cancelledAt ? "Cancelled" : registration.isPaid ? "Paid" : "Unpaid"}, updated {formatInquiryTime(registration.updatedAt)}.
            Your input has been kept. Close this dialog, review the latest record and reopen an available action.</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={change.isPending} onClick={close}>Close</Button>
            <Button type="submit" variant={draft.action === RegistrationAction.Cancel ? "destructive" : "default"}
              disabled={change.isPending || stale || !available}>{change.isPending ? "Saving…" : draft.action ? actionLabels[draft.action] : "Confirm"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}
