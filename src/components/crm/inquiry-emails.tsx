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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { $retryInquiryEmail, $getInquiry } from "@/features/crm/functions";
import { inquiryQueryKey } from "@/features/crm/queries";
import { canRetryEmail, emailStateLabels, formatCrmTime, inquiryErrorMessage, isCrmAccessError } from "@/features/crm/presentation";

type EmailJob = Awaited<ReturnType<typeof $getInquiry>>["emailJobs"][number];
/* Each email's name, plus one plain line on why it is sent. */
const EMAIL_KINDS: Record<string, { label: string; purpose: string; icon: typeof Mail }> = {
  [CrmEmailKind.CorporateAcknowledgment]: { label: "Customer Acknowledgement", purpose: "Tells the customer we got their inquiry.", icon: MailCheck },
  [CrmEmailKind.CorporateOverdue]: { label: "Overdue Reply Reminder", purpose: "Reminds staff that the first reply is late.", icon: BellRing },
  [CrmEmailKind.CorporateNotification]: { label: "Staff Notification", purpose: "Tells staff a new inquiry arrived.", icon: Inbox }
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
  return <InfoCard icon={Mail} title="Email Delivery" flush
    description="Accepted means the email provider took the message, not that it reached the inbox.">
    {jobs.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">No emails recorded.</p> : <Table>
      <TableHeader><TableRow>
        <TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead>
        <TableHead>Last Attempt</TableHead><TableHead>Accepted</TableHead><TableHead className="w-px text-right">Actions</TableHead>
      </TableRow></TableHeader>
      <TableBody>{jobs.map(job => {
        const kind = EMAIL_KINDS[job.kind] ?? EMAIL_KINDS[CrmEmailKind.CorporateNotification];
        return <TableRow key={job.id}>
          <TableCell className="whitespace-normal">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><kind.icon className="size-4" /></span>
              <div className="min-w-0">
                <p className="font-semibold">{kind.label}</p>
                <p className="text-muted-foreground">{kind.purpose}</p>
                {job.lastErrorCode && <p className="mt-1 text-xs text-destructive">Last result: {job.lastErrorCode.replaceAll("_", " ")}</p>}
                {job.state === CrmEmailState.NeedsReconciliation && <p className="mt-1 text-xs text-destructive">Ask an administrator to check the provider before attempting any new send.</p>}
              </div>
            </div>
          </TableCell>
          <TableCell><Badge variant={EMAIL_STATE_VARIANTS[job.state] ?? "neutral"}>{emailStateLabels[job.state] ?? job.state}</Badge></TableCell>
          <TableCell className="tabular-nums">{job.attemptCount}</TableCell>
          <TableCell className="text-muted-foreground">{formatCrmTime(job.lastAttemptAt)}</TableCell>
          <TableCell className="text-muted-foreground">{job.sentAt ? formatCrmTime(job.sentAt) : "Not yet"}</TableCell>
          <TableCell className="text-right">{canRetryEmail(job) && <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => { setSelected(job.id); retry.reset(); }}><RotateCw data-icon="inline-start" />Retry email</Button>}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !retry.isPending) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Retry this email?</DialogTitle><DialogDescription>The portal will attempt the original saved message again. It will record who requested the attempt. Sending settings and the saved content must be ready.</DialogDescription></DialogHeader>
        {retry.error && <p role="alert" className="text-sm text-destructive">{inquiryErrorMessage(retry.error)}</p>}
        {selectedJob && !canRetryEmail(selectedJob) && <p role="alert">The email state changed. A retry is no longer available.</p>}
        <DialogFooter><Button variant="outline" disabled={retry.isPending} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={retry.isPending || !selectedJob || !canRetryEmail(selectedJob)} onClick={() => selected && retry.mutate(selected)}>{retry.isPending ? "Attempting…" : "Confirm retry"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </InfoCard>;
}
