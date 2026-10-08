import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { CrmAccessDenied, CrmReadState } from "@/components/crm/read-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { crmAccessQueryOptions, crmEventQueryOptions, crmRegistrationsQueryOptions } from "@/features/crm/functions";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";
import { emailStateLabel } from "@/features/crm/labels";

export const Route = createFileRoute("/_app/registrations/$id")({ head: () => ({ meta: [{ title: "Workshop registrants" }] }), component: EventPage });

function EventPage() {
  const { id } = Route.useParams();
  return <EventRegistrants key={id} id={id} />;
}

function EventRegistrants({ id }: { id: string }) {
  const access = useQuery(crmAccessQueryOptions());
  const [filter, setFilter] = useState<"active" | "unpaid" | "paid" | "cancelled" | "all">("active");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [offset, setOffset] = useState(0);
  const event = useQuery({ ...crmEventQueryOptions(id), enabled: access.data === true });
  const registrations = useQuery({ ...crmRegistrationsQueryOptions({ workshopSessionId: id, filter, search, offset }), enabled: access.data === true && event.isSuccess });
  const refresh = () => { void event.refetch(); void registrations.refetch(); };
  if (access.isPending || access.isError) return <CrmReadState pending={access.isPending} failed={access.isError} retry={() => void access.refetch()} />;
  if (!access.data) return <CrmAccessDenied />;
  if (event.isPending || event.isError || !event.data) return <><Link to="/registrations" className="text-sm hover:underline">← All workshops</Link>
    <CrmReadState pending={event.isPending} failed={event.isError} retry={() => void event.refetch()} /></>;
  const data = event.data;
  return <ContentListPage title={data.workshopTitle}
    description={`${formatDateRange(data.date, data.endDate)} · ${formatTimeRange(data.startTime, data.endTime)} · Manila time`}
    action={<Button variant="outline" disabled={event.isFetching || registrations.isFetching} onClick={refresh}>Refresh</Button>}>
    <div className="flex flex-wrap items-center gap-3"><Link to="/registrations" className="text-sm hover:underline">← All workshops</Link>
      <StatusBadge display={SESSION_STATUS_DISPLAY[data.status]} /><span className="text-sm text-muted-foreground">{[data.venueName, data.city].filter(Boolean).join(", ")}</span></div>
    <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <div><dt className="text-sm text-muted-foreground">Reserved seats</dt><dd className="text-2xl font-medium">{data.counts.reserved} / {data.capacity}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Remaining</dt><dd className="text-2xl font-medium">{data.counts.remaining}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Paid</dt><dd className="text-2xl font-medium">{data.counts.paid}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Unpaid</dt><dd className="text-2xl font-medium">{data.counts.unpaid}</dd></div>
    </dl>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><FilterSelect label="Registrations" value={filter}
      options={[{ value: "active", label: "Active" }, { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All" }]}
      onChange={value => { setFilter(value); setOffset(0); }} />
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(draft.trim()); setOffset(0); }}>
        <Input aria-label="Search registrants by name or email" placeholder="Name or email" maxLength={200} value={draft} onChange={e => setDraft(e.target.value)} />
        <Button type="submit" variant="outline">Search</Button>
        {search && <Button type="button" variant="ghost" onClick={() => { setDraft(""); setSearch(""); setOffset(0); }}>Clear</Button>}
      </form></div>
    <CrmReadState pending={registrations.isPending} failed={registrations.isError} retry={() => void registrations.refetch()} />
    {!registrations.isPending && !registrations.isError && registrations.data && <>
      {registrations.data.items.length === 0 ? <EmptyState>No registrants match this search and filter.</EmptyState> :
        <Table><TableHeader><TableRow><TableHead>Registrant</TableHead><TableHead>Phone</TableHead><TableHead>Payment</TableHead><TableHead>Amount</TableHead><TableHead>Payment email</TableHead></TableRow></TableHeader>
          <TableBody>{registrations.data.items.map(row => <TableRow key={row.id}>
            <TableCell><span className="font-medium">{row.fullName}</span><div className="text-xs text-muted-foreground">{row.email}</div></TableCell>
            <TableCell>{row.phone}</TableCell><TableCell><Badge variant={row.cancelledAt ? "destructive" : row.paymentStatus === "paid" ? "default" : "outline"}>{row.cancelledAt ? "Cancelled" : row.paymentStatus === "paid" ? "Paid" : "Unpaid"}</Badge></TableCell>
            <TableCell>{formatPesos(row.priceCentavos)}</TableCell><TableCell>{emailStateLabel(row.emailJob?.state)}</TableCell>
          </TableRow>)}</TableBody></Table>}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={offset === 0 || registrations.isFetching} onClick={() => setOffset(offset - 50)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {offset / 50 + 1}</span>
        <Button variant="outline" disabled={!registrations.data.hasMore || registrations.isFetching || offset >= 100000} onClick={() => setOffset(offset + 50)}>Next</Button></div>
    </>}
  </ContentListPage>;
}
