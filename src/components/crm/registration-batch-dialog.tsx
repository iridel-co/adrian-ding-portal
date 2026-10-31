import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { $changeRegistration, type $listRegistrations } from "@/features/crm/functions";
import { emptyRegistrationDraft, registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationQueryKey } from "@/features/crm/registration-queries";
import { RegistrationAction, registrationActionSchema } from "@/features/crm/registration-staff-schemas";
import { RegistrationPaymentFields } from "./registration-payment-fields";

export type RegistrationRow = Awaited<ReturnType<typeof $listRegistrations>>["items"][number];
export type BatchAction = RegistrationAction.MarkPaid | RegistrationAction.Cancel;

export function RegistrationBatchDialog({ items, action, onClose, onCloseFocus }: {
  items: RegistrationRow[]; action: BatchAction; onClose: () => void; onCloseFocus: () => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState(() => items.map(item => ({ ...emptyRegistrationDraft,
    expectedUpdatedAt: new Date(item.updatedAt).toISOString() })));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const submitting = useRef(false);
  const paid = action === RegistrationAction.MarkPaid;
  const label = paid ? "Mark Paid" : "Cancel registrations";
  return <Dialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={!pending}
      onCloseAutoFocus={event => { event.preventDefault(); onCloseFocus(); }}>
      <form className="space-y-5" onSubmit={async event => {
        event.preventDefault();
        if (submitting.current || needsReview) return;
        const parsed = items.map((item, index) => registrationActionSchema.safeParse({
          id: item.id, action, expectedIsPaid: false, expectedUpdatedAt: drafts[index].expectedUpdatedAt,
          ...(paid ? { paymentMethod: drafts[index].paymentMethod, paidAmountCentavos: drafts[index].amount,
            payerName: drafts[index].payerName, providerTransactionReference: drafts[index].transactionReference } : { reason })
        }));
        const invalid = parsed.findIndex(result => !result.success);
        if (invalid >= 0) {
          setError(paid ? `Complete all payment fields for ${items[invalid].reference}, including the verified amount. Enter zero for a free registration.`
            : "Enter a cancellation reason.");
          return;
        }
        submitting.current = true;
        setPending(true);
        setError("");
        let completed = 0;
        try {
          for (const result of parsed) {
            if (!result.success) return;
            await $changeRegistration({ data: result.data });
            completed++;
          }
          toast.success(paid ? `${completed} registration(s) marked Paid. Check email delivery separately.`
            : `${completed} registration(s) cancelled. Seats released.`);
          onClose();
        } catch (error) {
          setNeedsReview(true);
          setError(`${completed} of ${items.length} saved. Stopped at ${items[completed].reference}. ${registrationErrorMessage(error)} Close and review the refreshed list before trying again.`);
        } finally {
          submitting.current = false;
          setPending(false);
          void queryClient.invalidateQueries({ queryKey: registrationQueryKey });
        }
      }}>
        <DialogHeader>
          <DialogTitle>{label} · {items.length} selected</DialogTitle>
          <DialogDescription>{paid
            ? "Check the actual funds and enter payment details for each registration. Each confirmation queues a payment acknowledgment email."
            : "Cancel these unpaid registrations and release their reserved seats. The reason is saved for each registration. No cancellation email is sent."}
            {" "}Registrations are saved individually. If one fails, earlier changes remain saved and the rest are stopped.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={pending || needsReview} className="space-y-5">
          {items.map((item, index) => <section key={item.id} className="space-y-4 rounded-lg border p-4" aria-label={item.reference}>
            <h3 className="font-medium">{item.fullName} · {item.reference}</h3>
            <p className="break-all text-sm text-muted-foreground">{item.email}</p>
            {paid && <RegistrationPaymentFields registration={item} draft={drafts[index]}
              updateDraft={patch => setDrafts(current => current.map((draft, i) => i === index ? { ...draft, ...patch } : draft))} />}
          </section>)}
          {!paid && <div className="space-y-2"><Label htmlFor="batch-cancellation-reason">Reason for all selected registrations</Label>
            <Textarea id="batch-cancellation-reason" required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></div>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Close</Button>
          <Button type="submit" variant={paid ? "default" : "destructive"} disabled={pending || needsReview}>
            {pending ? "Saving…" : `${label} (${items.length})`}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
