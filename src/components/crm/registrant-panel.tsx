import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CrmReadState } from "./read-state";
import { crmRegistrationQueryOptions } from "@/features/crm/functions";
import { CrmActionError, submitCrmAction } from "@/features/crm/actions";
import { emailStateLabel } from "@/features/crm/labels";
import { formatPesos } from "@/features/shared/money";

const timestamp = (date: Date | null) => date ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(date) : "—";
type Action = "paid" | "unpaid" | "cancel";
const actionTitles = { paid: "Mark Paid", unpaid: "Reverse to Unpaid", cancel: "Cancel registration" };

export function RegistrantPanel({ id, eventLabel, onClose, onReturnFocus }: { id: string; eventLabel: string; onClose: () => void; onReturnFocus: () => void }) {
  const client = useQueryClient();
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const refreshButton = useRef<HTMLButtonElement | null>(null);
  const [offset, setOffset] = useState(0);
  const detail = useQuery(crmRegistrationQueryOptions(id, offset));
  const [action, setAction] = useState<Action | null>(null);
  const [expectedPaymentStatus, setExpectedPaymentStatus] = useState<"paid" | "unpaid">("unpaid");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ["crm"] });
  const mutation = useMutation({
    mutationFn: async (request: { path: string; method: "PATCH" | "POST"; input: unknown; retry?: boolean }) => {
      const result = await submitCrmAction(request.path, request.method, request.input);
      return { result, retry: request.retry };
    },
    onSuccess: async ({ result, retry }) => {
      await refresh();
      setAction(null); setReason(""); setError("");
      if (retry) {
        const message = `Payment email: ${emailStateLabel(result.state)}`;
        if (result.state === "failed") toast.error(message);
        else toast.message(message);
      } else toast.success(result.changed ? "Registration updated" : "Registration already has this status");
    },
    onError: async (failure) => {
      setConflict(failure instanceof CrmActionError && ["payment_status_changed", "registration_cancelled", "paid_registration_cannot_cancel"].includes(failure.code));
      setError(failure instanceof CrmActionError ? failure.message : "Unable to complete the request. Refresh the record and try again.");
      await refresh();
    }
  });
  const begin = (next: Action) => { setExpectedPaymentStatus(detail.data?.paymentStatus ?? "unpaid"); setAction(next); setReason(""); setError(""); setConflict(false); };
  const row = detail.data;
  const confirm = () => {
    if (!row || !action) return;
    mutation.mutate(action === "cancel"
      ? { path: `registrations/${id}/cancel`, method: "POST", input: { reason } }
      : { path: `registrations/${id}/payment`, method: "PATCH", input: { paymentStatus: action, expectedPaymentStatus, ...(action === "unpaid" ? { reason } : {}) } });
  };
  return <Sheet open onOpenChange={open => { if (!open && !mutation.isPending && !action) onClose(); }}>
    <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl" onEscapeKeyDown={e => { if (mutation.isPending || action) e.preventDefault(); }}
      onCloseAutoFocus={e => { e.preventDefault(); onReturnFocus(); }}>
      <SheetHeader className="pr-12"><SheetTitle>{row?.fullName ?? "Registrant details"}</SheetTitle><SheetDescription>{eventLabel}</SheetDescription></SheetHeader>
      <div className="space-y-6 px-4 pb-6">
        <CrmReadState pending={detail.isPending} failed={detail.isError} retry={() => void detail.refetch()} />
        {!detail.isError && row && <>
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{row.cancelledAt ? "Cancelled" : row.paymentStatus === "paid" ? "Paid" : "Unpaid"} · {formatPesos(row.priceCentavos)}</span>
            <Button ref={refreshButton} variant="outline" size="sm" disabled={mutation.isPending || detail.isFetching} onClick={() => void refresh()}>Refresh record</Button></div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm *:break-words">
            <dt className="text-muted-foreground">Email</dt><dd>{row.email}</dd>
            <dt className="text-muted-foreground">Phone</dt><dd>{row.phone}</dd>
            <dt className="text-muted-foreground">Occupation</dt><dd>{row.occupation}</dd>
            <dt className="text-muted-foreground">Salary range</dt><dd>{row.salaryRange}</dd>
            <dt className="text-muted-foreground">City</dt><dd>{row.city || "Not provided"}</dd>
            <dt className="text-muted-foreground">Registered</dt><dd>{timestamp(row.createdAt)}</dd>
            <dt className="text-muted-foreground">Consent recorded</dt><dd>{timestamp(row.consentAt)}</dd>
            {row.cancelledAt && <><dt className="text-muted-foreground">Cancelled</dt><dd>{timestamp(row.cancelledAt)}</dd><dt className="text-muted-foreground">Reason</dt><dd className="whitespace-pre-wrap">{row.cancellationReason}</dd></>}
          </dl>
          {!row.cancelledAt && <div className="flex flex-wrap gap-2">
            <Button disabled={mutation.isPending} onClick={e => { actionButton.current = e.currentTarget; begin(row.paymentStatus === "paid" ? "unpaid" : "paid"); }}>{row.paymentStatus === "paid" ? "Reverse to Unpaid" : "Mark Paid"}</Button>
            {row.paymentStatus === "unpaid" && <Button variant="destructive" disabled={mutation.isPending} onClick={e => { actionButton.current = e.currentTarget; begin("cancel"); }}>Cancel registration</Button>}
          </div>}
          {error && !action && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {mutation.isPending && mutation.variables?.retry && <p role="status" className="text-sm">Retrying payment email…</p>}
          <section className="space-y-3"><h3 className="font-medium">Payment email</h3>
            {!row.emailJobs.length && <p className="text-sm text-muted-foreground">No email job.</p>}
            {row.emailJobs.map(job => <div key={job.id} className="space-y-2 rounded-lg border p-3 text-sm">
              <p>{emailStateLabel(job.state)}</p><p className="text-muted-foreground">Attempts: {job.attemptCount} · Last attempt: {timestamp(job.lastAttemptAt)}</p>
              {job.sentAt && <p>Provider accepted: {timestamp(job.sentAt)}</p>}
              {job.state === "needs_reconciliation" && <p>Check with the email provider before resending. Automatic retry is unavailable.</p>}
              {!row.cancelledAt && row.paymentStatus === "unpaid" && (job.state === "pending" || job.state === "failed" || job.state === "sending") && <Button variant="outline" size="sm" disabled={mutation.isPending || (job.state === "sending" && !!job.leaseExpiresAt && job.leaseExpiresAt > new Date())}
                onClick={() => { setError(""); mutation.mutate({ path: `emails/${job.id}/retry`, method: "POST", input: {}, retry: true }); }}>Retry payment email</Button>}
            </div>)}
          </section>
          <section className="space-y-3"><h3 className="font-medium">History</h3>
            {!row.history.length && <p className="text-sm text-muted-foreground">No payment or cancellation changes recorded.</p>}
            {row.history.map(entry => <div key={entry.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <p>{entry.cancelled ? "Registration cancelled" : entry.paymentTo ? `Payment: ${entry.paymentFrom} → ${entry.paymentTo}` : "Registration updated"}</p>
              <p className="text-muted-foreground">{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : "Unknown staff"} · {timestamp(entry.createdAt)} Manila time</p>
              {entry.reason && <p className="whitespace-pre-wrap">Reason: {entry.reason}</p>}
            </div>)}
            <div className="flex items-center justify-between"><Button size="sm" variant="outline" disabled={!offset || detail.isFetching} onClick={() => setOffset(offset - 50)}>Previous history</Button><Button size="sm" variant="outline" disabled={!row.historyHasMore || detail.isFetching || offset >= 100000} onClick={() => setOffset(offset + 50)}>Next history</Button></div>
          </section>
        </>}
      </div>
    </SheetContent>
    <AlertDialog open={!!action} onOpenChange={open => { if (!open && !mutation.isPending) setAction(null); }}>
      <AlertDialogContent onCloseAutoFocus={e => { e.preventDefault(); (actionButton.current?.isConnected ? actionButton.current : refreshButton.current)?.focus(); }}><AlertDialogHeader><AlertDialogTitle>{action ? actionTitles[action] : "Confirm change"}</AlertDialogTitle>
        <AlertDialogDescription>{row?.fullName} · {eventLabel} · {row && formatPesos(row.priceCentavos)}. {action === "paid" ? "Confirm that you checked payment outside the Portal. This sends no email." : action === "cancel" ? "This releases the reserved seat. No cancellation email is sent." : "This records payment as Unpaid. The seat remains reserved and no email is sent."}</AlertDialogDescription></AlertDialogHeader>
        {action && action !== "paid" && <div className="space-y-2"><Label htmlFor="registration-change-reason">Reason (required)</Label><Textarea id="registration-change-reason" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} disabled={mutation.isPending} /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>Back</AlertDialogCancel><Button disabled={mutation.isPending || conflict || detail.isError || !row || (action !== "paid" && !reason.trim())} onClick={confirm}>{mutation.isPending ? "Saving…" : "Confirm"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Sheet>;
}
