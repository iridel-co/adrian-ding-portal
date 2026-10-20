import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CrmEmailKind } from "@/db/schema/crm-email-kind";
import { CrmEmailState } from "@/db/schema/crm-email-state";
import { EmailDeliveryErrorCode, IntakeErrorCode } from "@/features/crm/errors";
import { $retryRegistrationEmail, type $getRegistration } from "@/features/crm/functions";
import { canRetryEmail, emailStateLabels, formatCrmTime, isCrmAccessError } from "@/features/crm/presentation";
import { canRetryRegistrationEmail, registrationEmailErrorMessage, registrationEmailLabels } from "@/features/crm/registration-presentation";
import { registrationQueryKey } from "@/features/crm/registration-queries";

type Registration = Awaited<ReturnType<typeof $getRegistration>>;
const deliveryMessages: Record<string, string> = {
  [EmailDeliveryErrorCode.ProviderRequestFailed]: "The provider request did not complete. The delivery outcome may be uncertain.",
  [EmailDeliveryErrorCode.ProviderRejected]: "The email provider rejected the attempt.",
  [EmailDeliveryErrorCode.ProviderThrottled]: "The email provider asked us to wait before retrying.",
  [EmailDeliveryErrorCode.ProviderResponseInvalid]: "The provider returned an unexpected response.",
  [EmailDeliveryErrorCode.ProviderConflict]: "The provider reported a conflicting request. Ask an administrator to review it.",
  [EmailDeliveryErrorCode.IdempotencyWindowExpired]: "The safe retry period has ended. Check delivery with the provider.",
  [EmailDeliveryErrorCode.PaymentInstructionsObsolete]: "Payment information is no longer applicable to this registration.",
  [EmailDeliveryErrorCode.PaymentAcknowledgmentObsolete]: "The acknowledgment is no longer applicable to this registration."
};

export function RegistrationEmails({ registration, onChanged, onAccessError }: {
  registration: Pick<Registration, "id" | "isPaid" | "cancelledAt" | "emailJobs">; onChanged: () => void; onAccessError: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const submitting = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  const retry = useMutation({
    mutationFn: (jobId: string) => $retryRegistrationEmail({ data: { registrationId: registration.id, jobId } }),
    retry: false,
    onSuccess: async result => {
      setSelected(null); onChanged();
      if (result?.state === CrmEmailState.Sent) toast.success("Email accepted by the provider. Inbox delivery is not confirmed.");
      else toast.info(result ? `Current email state: ${emailStateLabels[result.state]}. Payment status is unchanged.` : "Refresh to check the email state. Payment status is unchanged.");
      await queryClient.invalidateQueries({ queryKey: registrationQueryKey });
    },
    onError: async error => {
      if (isCrmAccessError(error)) { onAccessError(error); return; }
      if ([IntakeErrorCode.EmailNotRetryable, IntakeErrorCode.EmailJobNotFound].some(code => code === error.message)) {
        await queryClient.invalidateQueries({ queryKey: registrationQueryKey });
      }
    },
    onSettled: () => { submitting.current = false; }
  });
  const jobs = registration.emailJobs.filter(job => job.kind === CrmEmailKind.PaymentInstructions || job.kind === CrmEmailKind.PaymentAcknowledgment);
  const selectedJob = jobs.find(job => job.id === selected);
  const available = !!selectedJob && canRetryRegistrationEmail(selectedJob, registration);
  const close = () => { if (!submitting.current && !retry.isPending) setSelected(null); };
  return <section ref={section} tabIndex={-1} className="space-y-4" aria-labelledby="registration-email">
    <h2 id="registration-email" className="text-xl font-medium">Email delivery</h2>
    <p className="text-sm text-muted-foreground">Payment status is independent of email delivery. Accepted means the provider accepted the message, not confirmed inbox delivery. All times are in Manila.</p>
    {jobs.length === 0 && <p className="text-sm text-muted-foreground">No email jobs recorded.</p>}
    <div className="grid gap-4 sm:grid-cols-2">{jobs.map(job => <div key={job.id} className="space-y-3 rounded-lg border p-5">
      <h3 className="font-medium">{job.kind === CrmEmailKind.PaymentInstructions ? registrationEmailLabels[CrmEmailKind.PaymentInstructions] : registrationEmailLabels[CrmEmailKind.PaymentAcknowledgment]}</h3>
      <p className="text-sm font-medium">{emailStateLabels[job.state]}</p>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-muted-foreground">Attempts</dt><dd>{job.attemptCount}</dd></div>
        <div><dt className="text-muted-foreground">Last attempt</dt><dd>{formatCrmTime(job.lastAttemptAt)}</dd></div>
        <div><dt className="text-muted-foreground">Accepted by provider</dt><dd>{formatCrmTime(job.sentAt)}</dd></div>
      </dl>
      {job.lastErrorCode && <p className="text-sm text-muted-foreground">{deliveryMessages[job.lastErrorCode] ?? "The last attempt needs review. Check the current delivery state."}</p>}
      {job.state === CrmEmailState.NeedsReconciliation && <p className="text-sm">An administrator must check the provider outside this screen before any new send. Automatic retry is unavailable.</p>}
      {job.state === CrmEmailState.Sending && <p className="text-sm text-muted-foreground">{canRetryEmail(job)
        ? "The previous attempt did not finish updating. Recovery uses the same saved message."
        : "An attempt is still in progress. Refresh to check its result before retrying."}</p>}
      {[CrmEmailState.Pending, CrmEmailState.Failed, CrmEmailState.Sending].some(state => state === job.state) && (registration.cancelledAt
        ? <p className="text-sm text-muted-foreground">This registration is cancelled. No further email attempts are available.</p>
        : job.kind === CrmEmailKind.PaymentAcknowledgment && !registration.isPaid
          ? <p className="text-sm text-muted-foreground">Further acknowledgment attempts wait until the registration is Paid again. The saved delivery state is unchanged. An attempt already in progress cannot be recalled.</p>
          : job.kind === CrmEmailKind.PaymentInstructions && registration.isPaid
            ? <p className="text-sm text-muted-foreground">Payment information is no longer applicable because this registration is Paid.</p> : null)}
      {canRetryRegistrationEmail(job, registration) && <Button variant="outline" disabled={retry.isPending} onClick={event => {
        if (submitting.current || !canRetryRegistrationEmail(job, registration)) return;
        opener.current = event.currentTarget; setSelected(job.id); retry.reset();
      }}>Retry {job.kind === CrmEmailKind.PaymentInstructions ? "payment information" : "payment acknowledgment"}</Button>}
    </div>)}</div>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={!retry.isPending} onCloseAutoFocus={event => {
        event.preventDefault();
        const target = opener.current?.isConnected && !opener.current.disabled ? opener.current : section.current;
        target?.focus();
      }}>
        <DialogHeader><DialogTitle>Retry {selectedJob?.kind === CrmEmailKind.PaymentInstructions ? "payment information" : "payment acknowledgment"}?</DialogTitle>
          <DialogDescription>This attempts the original saved message again and records who requested the attempt. Payment corrections do not change the saved message. The server checks whether recovery is still allowed; it may return a delivery state without making another attempt. Payment status is unchanged.</DialogDescription></DialogHeader>
        {retry.error && <p role="alert" className="text-sm text-destructive">{registrationEmailErrorMessage(retry.error)}</p>}
        {!available && <p role="alert" className="text-sm">The email or registration state changed. A retry is no longer available. Close and review the latest record.</p>}
        <DialogFooter><Button variant="outline" disabled={retry.isPending} onClick={close}>Close</Button>
          <Button disabled={retry.isPending || !available} onClick={() => {
            if (submitting.current || retry.isPending || !selectedJob || !canRetryRegistrationEmail(selectedJob, registration)) return;
            submitting.current = true; retry.mutate(selectedJob.id);
          }}>{retry.isPending ? "Attempting…" : "Confirm retry"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
