import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { CrmAccessDenied, CrmReadState } from "@/components/crm/read-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { crmAccessQueryOptions, crmEventsQueryOptions } from "@/features/crm/functions";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";

export const Route = createFileRoute("/_app/registrations/")({ head: () => ({ meta: [{ title: "Registrations" }] }), component: RegistrationsPage });

function RegistrationsPage() {
  const access = useQuery(crmAccessQueryOptions());
  const [when, setWhen] = useState<"upcoming" | "past" | "all">("upcoming");
  const [offset, setOffset] = useState(0);
  const events = useQuery({ ...crmEventsQueryOptions({ when, offset }), enabled: access.data === true });
  if (access.isPending || access.isError) return <CrmReadState pending={access.isPending} failed={access.isError} retry={() => void access.refetch()} />;
  if (!access.data) return <CrmAccessDenied />;
  return <ContentListPage title="Registrations" description="Choose a scheduled workshop to manage its registrants. All times are Manila time."
    action={<Button variant="outline" disabled={events.isFetching} onClick={() => void events.refetch()}>Refresh</Button>}
    filters={<FilterSelect label="Workshop dates" value={when} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All dates" }]}
      onChange={value => { setWhen(value); setOffset(0); }} />}>
    <CrmReadState pending={events.isPending} failed={events.isError} retry={() => void events.refetch()} />
    {!events.isPending && !events.isError && events.data && <>
      {events.data.items.length === 0 ? <EmptyState>No scheduled workshops match these dates.</EmptyState> :
        <Table><TableHeader><TableRow><TableHead>Workshop</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Reserved</TableHead><TableHead>Paid / Unpaid</TableHead></TableRow></TableHeader>
          <TableBody>{events.data.items.map(event => <TableRow key={event.id}>
            <TableCell><Link to="/registrations/$id" params={{ id: event.id }} className="font-medium hover:underline">{event.workshopTitle}</Link>
              <div className="text-xs text-muted-foreground">{[event.venueName, event.city].filter(Boolean).join(", ")}</div></TableCell>
            <TableCell className="whitespace-normal">{formatDateRange(event.date, event.endDate)}<div className="text-xs text-muted-foreground">{formatTimeRange(event.startTime, event.endTime)}</div></TableCell>
            <TableCell><StatusBadge display={SESSION_STATUS_DISPLAY[event.status]} /></TableCell>
            <TableCell>{event.counts.reserved} / {event.capacity}</TableCell><TableCell>{event.counts.paid} / {event.counts.unpaid}</TableCell>
          </TableRow>)}</TableBody></Table>}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={offset === 0 || events.isFetching} onClick={() => setOffset(offset - 50)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {offset / 50 + 1}</span>
        <Button variant="outline" disabled={!events.data.hasMore || events.isFetching || offset >= 100000} onClick={() => setOffset(offset + 50)}>Next</Button></div>
    </>}
  </ContentListPage>;
}
