import { useRef, useState } from "react";
import { CrmReadState } from "@/components/crm/read-state";
import { paymentMethodLabels } from "@/features/crm/registration-presentation";
import { Button } from "@/components/ui/button";
import type { $getRegistration } from "@/features/crm/functions";
import { emailStateLabels, formatCrmTime } from "@/features/crm/presentation";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { formatPesos } from "@/features/shared/money";

type History = Awaited<ReturnType<typeof $getRegistration>>["history"][number];
export function RegistrationHistory({ entries, offset, hasMore, pending, fetching, error, retry, onPage }: {
  entries: History[]; offset: number; hasMore: boolean; pending: boolean; fetching: boolean; error: unknown;
  retry: () => void; onPage: (offset: number) => void;
}) {
  const section = useRef<HTMLElement>(null);
  const [transitionHeight, setTransitionHeight] = useState<number>();
  const page = (offset: number) => { setTransitionHeight(section.current?.offsetHeight); onPage(offset); };
  return <section ref={section} style={{ minHeight: pending ? transitionHeight : undefined }} className="space-y-4" aria-labelledby="registration-history">
    <h2 id="registration-history" className="text-xl font-medium">History</h2>
    <p className="text-sm text-muted-foreground">Staff changes and email retry attempts. All times are in Manila. Check Email delivery for the current outcome of an attempt.</p>
    <CrmReadState pending={pending} error={error} retry={retry} loadingMessage="Loading registration history…"
      accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage} />
    {!pending && !error && <>
      {entries.length ? <ol className="space-y-3">{entries.map(entry => <HistoryEntry key={entry.id} entry={entry} />)}</ol>
        : <p className="text-sm text-muted-foreground">No staff actions on this history page.</p>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" disabled={offset === 0 || fetching} onClick={() => page(Math.max(0, offset - 20))}>Newer history</Button>
        <p className="text-sm" aria-live="polite">Page {Math.floor(offset / 20) + 1}</p>
        <Button variant="outline" disabled={!hasMore || fetching || offset >= 100000} onClick={() => page(offset + 20)}>Older history</Button>
      </div>
    </>}
  </section>;
}

function HistoryEntry({ entry }: { entry: History }) {
  const { changes } = entry;
  const actor = changes.actor?.to;
  const payment = (value: boolean | null) => value === null ? "Not recorded" : value ? "Paid" : "Unpaid";
  const title = changes.emailRetry ? "Email retry attempt recorded" : changes.cancelledAt?.to ? "Registration cancelled"
    : changes.isPaid?.to === true ? "Marked Paid" : changes.isPaid?.to === false ? "Corrected to Unpaid" : "Registration updated";
  return <li className="space-y-2 rounded-lg border p-5">
    <h3 className="font-medium">{title}</h3>
    <p className="text-sm text-muted-foreground">{formatCrmTime(entry.createdAt)} · {actor ? `${actor.name} (${actor.email})` : "Staff identity not recorded"}</p>
    <dl className="space-y-2 text-sm">
      {changes.isPaid && <Change label="Payment status" from={payment(changes.isPaid.from)} to={payment(changes.isPaid.to)} />}
      {changes.paymentMethod && <Change label="Payment method" from={changes.paymentMethod.from ? paymentMethodLabels[changes.paymentMethod.from] : "Not recorded"}
        to={changes.paymentMethod.to ? paymentMethodLabels[changes.paymentMethod.to] : "Not recorded"} />}
      {changes.paidAmountCentavos && <Change label="Verified amount" from={changes.paidAmountCentavos.from === null ? "Not recorded" : formatPesos(changes.paidAmountCentavos.from)}
        to={changes.paidAmountCentavos.to === null ? "Not recorded" : formatPesos(changes.paidAmountCentavos.to)} />}
      {changes.payerName && <Change label="Payer name" from={changes.payerName.from ?? "Not recorded"} to={changes.payerName.to ?? "Not recorded"} />}
      {changes.providerTransactionReference && <Change label="Provider transaction reference" from={changes.providerTransactionReference.from ?? "Not recorded"} to={changes.providerTransactionReference.to ?? "Not recorded"} />}
      {changes.verifiedAt && <Change label="Verified at" from={formatCrmTime(changes.verifiedAt.from)} to={formatCrmTime(changes.verifiedAt.to)} />}
      {changes.cancelledAt?.to && <div><dt className="text-muted-foreground">Cancelled at</dt><dd>{formatCrmTime(changes.cancelledAt.to)}</dd></div>}
      {(changes.reason?.to || changes.cancellationReason?.to) && <div><dt className="text-muted-foreground">Reason</dt><dd className="whitespace-pre-wrap break-words">{changes.reason?.to || changes.cancellationReason?.to}</dd></div>}
    </dl>
    {changes.emailRetry?.to && <div className="space-y-1 text-sm">
      <p>Attempt {changes.emailRetry.to.attemptCount} recorded{changes.emailRetry.from ? ` after ${changes.emailRetry.from.attemptCount} previous attempts` : ""}.</p>
      <p>{changes.emailRetry.from ? emailStateLabels[changes.emailRetry.from.state] ?? "Not recorded" : "Not recorded"} → {emailStateLabels[changes.emailRetry.to.state] ?? "Not recorded"}</p>
      <p className="text-muted-foreground">This records the attempt starting. It does not confirm delivery.</p>
    </div>}
  </li>;
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{from} → {to}</dd></div>;
}
