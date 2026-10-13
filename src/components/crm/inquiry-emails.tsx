import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { $retryInquiryEmail, $getInquiry } from "@/features/crm/functions";
import { inquiryQueryKey } from "@/features/crm/queries";
import { canRetryInquiryEmail, emailStateLabels, formatInquiryTime, inquiryErrorMessage, isInquiryAccessError } from "@/features/crm/presentation";

type EmailJob = Awaited<ReturnType<typeof $getInquiry>>["emailJobs"][number];
export function InquiryEmails({ inquiryId, jobs }: { inquiryId: string; jobs: EmailJob[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const retry = useMutation({
    mutationFn: (jobId: string) => $retryInquiryEmail({ data: { inquiryId, jobId } }),
    onSuccess: async result => {
      setSelected(null);
      if (result?.state === "sent") toast.success("Email accepted by the provider.");
      else toast.info(result ? `Email state: ${emailStateLabels[result.state] ?? result.state}.` : "Refresh to check the email state.");
      await queryClient.invalidateQueries({ queryKey: inquiryQueryKey });
    },
    onError: async error => {
      if (error.message === "email_not_retryable" || isInquiryAccessError(error)) await queryClient.invalidateQueries({ queryKey: inquiryQueryKey });
    }
  });
  const selectedJob = jobs.find(job => job.id === selected);
  return <section className="space-y-3"><h2 className="text-xl font-medium">Email delivery</h2>
    <p className="text-sm text-muted-foreground">Provider acceptance does not confirm inbox delivery. Replies and proposals are handled outside the portal.</p>
    <div className="grid gap-3 sm:grid-cols-2">{jobs.map(job => <div className="space-y-2 rounded-lg border p-4" key={job.id}>
      <h3 className="font-medium">{job.kind === "corporate_acknowledgment" ? "Customer acknowledgement" : job.kind === "corporate_overdue" ? "Overdue reply reminder" : "Staff notification"}</h3>
      <p>{emailStateLabels[job.state] ?? job.state}</p><p className="text-sm text-muted-foreground">Attempts: {job.attemptCount}<br />Last attempt: {formatInquiryTime(job.lastAttemptAt)}{job.sentAt && <><br />Accepted: {formatInquiryTime(job.sentAt)}</>}</p>
      {job.lastErrorCode && <p className="text-sm text-muted-foreground">Last result: {job.lastErrorCode.replaceAll("_", " ")}</p>}
      {job.state === "needs_reconciliation" && <p className="text-sm">Ask an administrator to check the provider before attempting any new send.</p>}
      {canRetryInquiryEmail(job) && <Button variant="outline" disabled={retry.isPending} onClick={() => { setSelected(job.id); retry.reset(); }}>Retry email</Button>}
    </div>)}</div>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !retry.isPending) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Retry this email?</DialogTitle><DialogDescription>The portal will attempt the original saved message again. It will record who requested the attempt. Sending settings and the saved content must be ready.</DialogDescription></DialogHeader>
        {retry.error && <p role="alert" className="text-sm text-destructive">{inquiryErrorMessage(retry.error)}</p>}
        {selectedJob && !canRetryInquiryEmail(selectedJob) && <p role="alert">The email state changed. A retry is no longer available.</p>}
        <DialogFooter><Button variant="outline" disabled={retry.isPending} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={retry.isPending || !selectedJob || !canRetryInquiryEmail(selectedJob)} onClick={() => selected && retry.mutate(selected)}>{retry.isPending ? "Attempting…" : "Confirm retry"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
