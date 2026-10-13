import { IntakeErrorCode } from "@/features/crm/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { MoneyField } from "@/components/cms/money-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { $changeInquiry } from "@/features/crm/functions";
import { inquiryTransitions, type InquiryStatus } from "@/features/crm/lifecycle";
import { inquiryActionLabels, inquiryErrorMessage, inquiryStatusLabels, isInquiryAccessError } from "@/features/crm/presentation";
import { inquiryQueryKey } from "@/features/crm/queries";
import { inquiryTransitionSchema } from "@/features/crm/schemas";

type ActionStatus = Exclude<InquiryStatus, "NEW">;
export type InquiryDraft = {
  selected: ActionStatus | null; expectedStatus: InquiryStatus; value: number | null; reason: string; validation: string;
};
export function InquiryActions({ inquiry, draft, setDraft }: {
  inquiry: { id: string; status: InquiryStatus }; draft: InquiryDraft; setDraft: Dispatch<SetStateAction<InquiryDraft>>;
}) {
  const queryClient = useQueryClient();
  const { selected, expectedStatus, value, reason, validation } = draft;
  const updateDraft = (patch: Partial<InquiryDraft>) => setDraft(current => ({ ...current, ...patch }));
  const change = useMutation({
    mutationFn: (data: Parameters<typeof $changeInquiry>[0]["data"]) => $changeInquiry({ data }),
    onSuccess: async () => { updateDraft({ selected: null }); toast.success("Inquiry status updated."); await queryClient.invalidateQueries({ queryKey: inquiryQueryKey }); },
    onError: async error => {
      if (error.message === IntakeErrorCode.InquiryStatusChanged || error.message === IntakeErrorCode.InvalidInquiryTransition || isInquiryAccessError(error)) {
        await queryClient.invalidateQueries({ queryKey: inquiryQueryKey });
      }
    }
  });
  const allowed = inquiryTransitions[inquiry.status];
  const stale = expectedStatus !== inquiry.status;
  const actionAvailable = selected && allowed.includes(selected);
  return <section className="space-y-3" aria-label="Inquiry actions">
    <h2 className="text-xl font-medium">Record progress</h2>
    <p className="text-sm text-muted-foreground">Send replies and proposals outside the portal, then record the completed action here.</p>
    <div className="flex flex-wrap gap-2">{allowed.map(status => <Button key={status} variant={status === "LOST" || status === "SPAM" ? "outline" : "default"} onClick={() => {
      updateDraft({ selected: status as ActionStatus, expectedStatus: inquiry.status, value: null, reason: "", validation: "" }); change.reset();
    }}>{inquiryActionLabels[status]}</Button>)}</div>
    {allowed.length === 0 && <p className="text-sm text-muted-foreground">This inquiry is closed. No further status changes are available.</p>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !change.isPending) updateDraft({ selected: null }); }}>
      <DialogContent><form className="space-y-5" onSubmit={event => {
        event.preventDefault();
        if (!selected || stale || !actionAvailable || change.isPending) return;
        const parsed = inquiryTransitionSchema.safeParse({ expectedStatus, status: selected,
          ...(selected === "PROPOSAL_SENT" ? { estimatedValueCentavos: value ?? undefined } : {}),
          ...(selected === "LOST" ? { lostReason: reason } : {}) });
        if (!parsed.success) { updateDraft({ validation: parsed.error.issues[0].message }); return; }
        updateDraft({ validation: "" }); change.mutate({ id: inquiry.id, ...parsed.data });
      }}>
        <DialogHeader><DialogTitle>{selected ? inquiryActionLabels[selected] : "Record progress"}</DialogTitle>
          <DialogDescription>{selected === "CONTACTED" ? "Confirm that the first human reply has been sent. The automatic acknowledgement does not count." : selected === "PROPOSAL_SENT" ? "Confirm that the written proposal has been sent and enter its value." : selected === "WON" ? "Confirm that the customer accepted the proposal." : selected === "LOST" ? "Record why this inquiry will not proceed." : "Confirm that this inquiry is spam. The record will remain available in the Spam filter."} This action will be recorded in history.</DialogDescription></DialogHeader>
        {selected === "PROPOSAL_SENT" && <div className="space-y-2"><Label htmlFor="proposal-value">Proposal value in pesos</Label><MoneyField id="proposal-value" value={value} onChange={value => updateDraft({ value })} /></div>}
        {selected === "LOST" && <div className="space-y-2"><Label htmlFor="loss-reason">Loss reason</Label><Textarea id="loss-reason" value={reason} onChange={event => updateDraft({ reason: event.target.value })} required maxLength={2000} /></div>}
        {(validation || change.error) && <p role="alert" className="text-sm text-destructive">{validation || inquiryErrorMessage(change.error)}</p>}
        {stale && <div role="alert" className="space-y-2 text-sm"><p>The latest status is {inquiryStatusLabels[inquiry.status]}. Your input has been kept.</p>
          {actionAvailable ? <Button type="button" variant="outline" onClick={() => { updateDraft({ expectedStatus: inquiry.status }); change.reset(); }}>Use latest status</Button> : <p>This action is no longer available. Close this dialog and choose an available action.</p>}</div>}
        <DialogFooter><Button type="button" variant="outline" disabled={change.isPending} onClick={() => updateDraft({ selected: null })}>Cancel</Button><Button type="submit" disabled={change.isPending || stale || !actionAvailable}>{change.isPending ? "Saving…" : "Confirm change"}</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
  </section>;
}
