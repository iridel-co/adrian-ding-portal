import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QuickAction } from "@/components/quick-action";
import { countOf, runBulk } from "@/components/table/row-actions";
import { ACTION_ICONS, ACTION_TONE } from "@/components/crm/inquiry-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { $changeInquiry } from "@/features/crm/functions";
import { inquiryTransitions, type InquiryStatus } from "@/features/crm/lifecycle";
import { inquiryErrorMessage } from "@/features/crm/presentation";
import { inquiryQueryKey } from "@/features/crm/queries";

type Row = { id: string; company: string; status: InquiryStatus };
type BulkStatus = "CONTACTED" | "WON" | "LOST" | "SPAM";

/* A sent proposal needs its own value, so that one stays on the inquiry page. */
const BULK_ACTIONS: Record<BulkStatus, { short: string; title: (count: string) => string; note: string; done: (count: string) => string }> = {
  CONTACTED: { short: "First reply", title: n => `Record a first reply for ${n}?`, note: "Confirm a person has replied to each of them. The automatic acknowledgement doesn't count.", done: n => `Recorded a first reply for ${n}.` },
  WON: { short: "Won", title: n => `Mark ${n} as won?`, note: "Confirm each customer accepted the proposal.", done: n => `Marked ${n} as won.` },
  LOST: { short: "Lost", title: n => `Mark ${n} as lost?`, note: "The reason below is saved on each of them.", done: n => `Marked ${n} as lost.` },
  SPAM: { short: "Spam", title: n => `Mark ${n} as spam?`, note: "They stay available under the Spam filter.", done: n => `Marked ${n} as spam.` }
};
const inquiries = (count: number) => countOf(count, "inquiry", "inquiries");

/*
  Bulk status buttons for the selection bar. Each one appears when it fits at
  least one ticked inquiry and runs only on those. Every change asks first,
  since won, lost and spam close an inquiry for good.
*/
export function InquiryBulkActions({ items, onDone }: { items: Row[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<{ status: BulkStatus; rows: Row[] } | null>(null);
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: ({ status, rows }: { status: BulkStatus; rows: Row[] }) => runBulk(rows,
      row => $changeInquiry({ data: { id: row.id, expectedStatus: row.status, status, ...(status === "LOST" ? { lostReason: reason.trim() } : {}) } }),
      { name: row => row.company, done: count => BULK_ACTIONS[status].done(inquiries(count)), message: inquiryErrorMessage }),
    onSettled: async () => {
      setChosen(null); setReason(""); onDone();
      await queryClient.invalidateQueries({ queryKey: inquiryQueryKey });
    }
  });
  const action = chosen && BULK_ACTIONS[chosen.status];

  return <>
    {(Object.keys(BULK_ACTIONS) as BulkStatus[]).map(status => {
      const fits = items.filter(item => inquiryTransitions[item.status].includes(status));
      if (fits.length === 0) return null;
      return <QuickAction key={status} icon={ACTION_ICONS[status]} tone={ACTION_TONE[status]}
        disabled={run.isPending} onClick={() => setChosen({ status, rows: fits })}>
        {fits.length < items.length ? `${BULK_ACTIONS[status].short} ${fits.length}` : BULK_ACTIONS[status].short}
      </QuickAction>;
    })}
    <Dialog open={chosen !== null} onOpenChange={open => { if (!open && !run.isPending) setChosen(null); }}>
      <DialogContent>{chosen && action && <form className="space-y-5" onSubmit={event => { event.preventDefault(); run.mutate(chosen); }}>
        <DialogHeader>
          <DialogTitle>{action.title(inquiries(chosen.rows.length))}</DialogTitle>
          <DialogDescription>{action.note} Each change is recorded in that inquiry's history.</DialogDescription>
        </DialogHeader>
        {chosen.status === "LOST" && <div className="space-y-2"><Label htmlFor="bulk-loss-reason">Loss reason</Label>
          <Textarea id="bulk-loss-reason" value={reason} onChange={event => setReason(event.target.value)} required maxLength={2000} /></div>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={run.isPending} onClick={() => setChosen(null)}>Cancel</Button>
          <Button type="submit" disabled={run.isPending || (chosen.status === "LOST" && !reason.trim())}>{run.isPending ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </form>}</DialogContent>
    </Dialog>
  </>;
}
