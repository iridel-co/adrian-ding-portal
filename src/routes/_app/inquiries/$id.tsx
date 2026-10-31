import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { CrmReadState } from "@/components/crm/read-state";
import { InquiryActions, type InquiryDraft } from "@/components/crm/inquiry-actions";
import { InquiryEmails } from "@/components/crm/inquiry-emails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { inquirySearchSchema } from "@/features/crm/inquiry-navigation";
import { inquiryQueryOptions } from "@/features/crm/queries";
import { formatCrmTime, inquiryStatusLabels, isInquiryOverdue } from "@/features/crm/presentation";
import { formatDate, formatDateRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";
import type { $getInquiry } from "@/features/crm/functions";

export const Route = createFileRoute("/_app/inquiries/$id")({
  validateSearch: inquirySearchSchema,
  head: () => ({ meta: [{ title: "Corporate inquiry" }] }),
  component: InquiryPage
});

function InquiryPage() {
  const { id } = Route.useParams();
  return <InquiryDetail key={id} id={id} />;
}

function InquiryDetail({ id }: { id: string }) {
  const search = Route.useSearch();
  const [offset, setOffset] = useState(0);
  // Keep entered values if a failed refresh temporarily hides the detail panels.
  const [draft, setDraft] = useState<InquiryDraft>({ selected: null, expectedStatus: "NEW", value: null, reason: "", validation: "" });
  const result = useQuery(inquiryQueryOptions(id, offset));
  const inquiry = result.data;
  return <div className="mx-auto flex max-w-5xl flex-col gap-6">
    <div className="flex items-center justify-between gap-3"><Link to="/inquiries" search={search} className="text-sm underline underline-offset-4">Back to inquiries</Link><Button variant="outline" disabled={result.isFetching} onClick={() => void result.refetch()}>Refresh</Button></div>
    <CrmReadState pending={result.isPending} error={result.error} retry={() => void result.refetch()} />
    {!result.isError && inquiry && <>
      <header><h1 className="font-display text-4xl break-words">{inquiry.company}</h1><p className="mt-2">{inquiry.program}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary">{inquiryStatusLabels[inquiry.status]}</Badge>{isInquiryOverdue(inquiry) && <Badge variant="destructive">First reply overdue</Badge>}</div><p className="mt-2 text-xs text-muted-foreground break-all">Inquiry ID: {inquiry.id}</p></header>
      <section className="rounded-lg border p-5"><h2 className="mb-4 text-xl font-medium">Submitted requirements</h2><dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact">{inquiry.fullName}</Field><Field label="Role">{inquiry.role}</Field>
        <Field label="Email"><a className="underline break-all" href={`mailto:${inquiry.email}`}>{inquiry.email}</a></Field><Field label="Phone">{inquiry.phone}</Field>
        <Field label="Programme">{inquiry.program}</Field><Field label="Attendees">{inquiry.attendees}</Field>
        <Field label="Target dates">{inquiry.targetDateFrom ? inquiry.targetDateTo ? formatDateRange(inquiry.targetDateFrom, inquiry.targetDateTo) : formatDate(inquiry.targetDateFrom) : inquiry.targetDateText}</Field>
        <Field label="Venue">{inquiry.venue}</Field><Field label="Also interested in">{inquiry.alsoInterested.length ? inquiry.alsoInterested.join(", ") : "None specified"}</Field>
        <Field label="Context">{inquiry.context || "None provided"}</Field>
      </dl></section>
      <section className="rounded-lg border p-5"><h2 className="mb-4 text-xl font-medium">Progress and response deadline</h2><p className="mb-4 text-sm text-muted-foreground">All times are in Manila. The first reply deadline is two weekdays after submission.</p><dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Received">{formatCrmTime(inquiry.createdAt)}</Field><Field label="First reply due">{formatCrmTime(inquiry.slaDueAt)}</Field>
        <Field label="First reply recorded">{formatCrmTime(inquiry.contactedAt)}</Field><Field label="Proposal recorded">{formatCrmTime(inquiry.proposalSentAt)}</Field>
        <Field label="Proposal value">{inquiry.estimatedValueCentavos === null ? "Not recorded" : formatPesos(inquiry.estimatedValueCentavos)}</Field><Field label="Closed">{formatCrmTime(inquiry.closedAt)}</Field>
        {inquiry.lostReason && <Field label="Loss reason">{inquiry.lostReason}</Field>}
      </dl></section>
      <InquiryActions inquiry={inquiry} draft={draft} setDraft={setDraft} />
      <InquiryEmails inquiryId={inquiry.id} jobs={inquiry.emailJobs} />
      <section className="space-y-4"><h2 className="text-xl font-medium">History</h2>
        {inquiry.history.length === 0 ? <p className="text-sm text-muted-foreground">No staff actions recorded yet.</p> : <ol className="space-y-3">{inquiry.history.map(entry => <HistoryEntry key={entry.id} entry={entry} />)}</ol>}
        <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={offset === 0 || result.isFetching} onClick={() => setOffset(Math.max(0, offset - 20))}>Newer history</Button><p className="text-sm">Page {Math.floor(offset / 20) + 1}</p><Button variant="outline" disabled={!inquiry.historyHasMore || result.isFetching || offset >= 100000} onClick={() => setOffset(offset + 20)}>Older history</Button></div>
      </section>
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{children}</dd></div>;
}

type History = Awaited<ReturnType<typeof $getInquiry>>["history"][number];
function HistoryEntry({ entry }: { entry: History }) {
  const { changes } = entry;
  const actor = changes.actor?.to;
  return <li className="space-y-2 rounded-lg border p-4">
    <p className="font-medium">{changes.emailRetry ? "Email retry attempted" : "Status changed"}</p>
    <p className="text-sm text-muted-foreground">{formatCrmTime(entry.createdAt)} · {actor ? `${actor.name} (${actor.email})` : "Staff"}</p>
    {changes.status && <p>{changes.status.from ? inquiryStatusLabels[changes.status.from] : "Not recorded"} → {changes.status.to ? inquiryStatusLabels[changes.status.to] : "Not recorded"}</p>}
    {changes.estimatedValueCentavos && <p>Proposal value: {changes.estimatedValueCentavos.from === null ? "Not recorded" : formatPesos(changes.estimatedValueCentavos.from)} → {changes.estimatedValueCentavos.to === null ? "Not recorded" : formatPesos(changes.estimatedValueCentavos.to)}</p>}
    {changes.lostReason?.to && <p className="whitespace-pre-wrap break-words">Loss reason: {changes.lostReason.to}</p>}
    {changes.emailRetry?.to && <p className="text-sm">Attempt {changes.emailRetry.to.attemptCount} recorded. Check Email delivery for the current result.</p>}
  </li>;
}
