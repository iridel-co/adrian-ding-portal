import { CrmEmailKind } from "@/db/schema/crm-email-kind";
import { CrmEmailState } from "@/db/schema/crm-email-state";
import { IntakeErrorCode } from "@/features/crm/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Inbox, Mail, MailCheck, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InfoCard } from "@/components/crm/detail-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { $retryInquiryEmail, $getInquiry } from "@/features/crm/functions";
import { inquiryQueryKey } from "@/features/crm/queries";
import { canRetryEmail, emailStateLabels, formatCrmTime, inquiryErrorMessage, isCrmAccessError } from "@/features/crm/presentation";

type EmailJob = Awaited<ReturnType<typeof $getInquiry>>["emailJobs"][number];
const EMAIL_KINDS: Record<string, { label: string; icon: typeof Mail }> = {
  [CrmEmailKind.CorporateAcknowledgment]: { label: "Customer acknowledgement", icon: MailCheck },
  [CrmEmailKind.CorporateOverdue]: { label: "Overdue reply reminder", icon: BellRing },
  [CrmEmailKind.CorporateNotification]: { label: "Staff notification", icon: Inbox }
};
/* Green is accepted, amber is still waiting, red needs someone to look at it. */
const EMAIL_STATE_VARIANTS: Record<string, "success" | "warning" | "info" | "neutral" | "destructive"> = {
  [CrmEmailState.Sent]: "success", [CrmEmailState.Pending]: "warning", [CrmEmailState.Sending]: "info",
  [CrmEmailState.Failed]: "destructive", [CrmEmailState.NeedsReconciliation]: "destructive", [CrmEmailState.Skipped]: "neutral"
};
export function InquiryEmails({ inquiryId, jobs }: { inquiryId: string; jobs: EmailJob[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const retry = useMutation({
    mutationFn: (jobId: string) => $retryInquiryEmail({ data: { inquiryId, jobId } }),
    onSuccess: async result => {
      setSelected(null);
      if (result?.state === CrmEmailState.Sent) toast.success("Email accepted by the provider.");
      else toast.info(result ? `Email state: ${emailStateLabels[result.state] ?? result.state}.` : "Refresh to check the email state.");
      await queryClient.invalidateQueries({ queryKey: inquiryQueryKey });
    },
    onError: async error => {
      if (error.message === IntakeErrorCode.EmailNotRetryable || isCrmAccessError(error)) await queryClient.invalidateQueries({ queryKey: inquiryQueryKey });
    }
  });
  const selectedJob = jobs.find(job => job.id === selected);
  return <InfoCard icon={Mail} title="Email delivery">
    <p className="mb-4 text-xs text-muted-foreground">Accepted means the email provider took the message, not that it reached the inbox.</p>
    {jobs.length === 0 && <p className="text-sm text-muted-foreground">No emails recorded.</p>}
    <ul className="divide-y">{jobs.map(job => {
      const kind = EMAIL_KINDS[job.kind] ?? EMAIL_KINDS[CrmEmailKind.CorporateNotification];
      return <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0" key={job.id}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 font-medium"><kind.icon className="size-4 shrink-0 text-muted-foreground" />{kind.label}</h3>
          <Badge variant={EMAIL_STATE_VARIANTS[job.state] ?? "neutral"}>{emailStateLabels[job.state] ?? job.state}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{job.attemptCount} {job.attemptCount === 1 ? "attempt" : "attempts"} · Last attempt {formatCrmTime(job.lastAttemptAt)}{job.sentAt && <> · Accepted {formatCrmTime(job.sentAt)}</>}</p>
        {job.lastErrorCode && <p className="text-xs text-muted-foreground">Last result: {job.lastErrorCode.replaceAll("_", " ")}</p>}
        {job.state === CrmEmailState.NeedsReconciliation && <p className="text-xs">Ask an administrator to check the provider before attempting any new send.</p>}
        {canRetryEmail(job) && <Button className="self-start" size="sm" variant="outline" disabled={retry.isPending} onClick={() => { setSelected(job.id); retry.reset(); }}><RotateCw data-icon="inline-start" />Retry email</Button>}
      </li>;
    })}</ul>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !retry.isPending) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Retry this email?</DialogTitle><DialogDescription>The portal will attempt the original saved message again. It will record who requested the attempt. Sending settings and the saved content must be ready.</DialogDescription></DialogHeader>
        {retry.error && <p role="alert" className="text-sm text-destructive">{inquiryErrorMessage(retry.error)}</p>}
        {selectedJob && !canRetryEmail(selectedJob) && <p role="alert">The email state changed. A retry is no longer available.</p>}
        <DialogFooter><Button variant="outline" disabled={retry.isPending} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={retry.isPending || !selectedJob || !canRetryEmail(selectedJob)} onClick={() => selected && retry.mutate(selected)}>{retry.isPending ? "Attempting…" : "Confirm retry"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </InfoCard>;
}
