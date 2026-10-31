import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CrmTablePagination } from "@/components/crm/table-pagination";
import { ContentListPage, EmptyState } from "@/components/cms/content-list-page";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { CrmReadState } from "@/components/crm/read-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { crmPaginationSearchSchema } from "@/features/crm/pagination";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationSessionsQueryOptions } from "@/features/crm/registration-queries";
import { registrationSessionListSchema } from "@/features/crm/registration-staff-schemas";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { hasSessionEnded } from "@/features/shared/time";

const searchSchema = registrationSessionListSchema.pick({ when: true }).and(crmPaginationSearchSchema);
const whenOptions: { value: z.output<typeof searchSchema>["when"]; label: string }[] = [
  { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All dates" }
];

export const Route = createFileRoute("/_app/registrations/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Scheduled workshops" }] }),
  component: RegistrationRunsPage
});

function RegistrationRunsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const runs = useQuery(registrationSessionsQueryOptions(search));
  return <ContentListPage title="Scheduled workshops" description="Reserved seats and payment counts for each scheduled workshop. All dates and times are in Manila."
    action={<Button variant="outline" disabled={runs.isFetching} onClick={() => void runs.refetch()}>Refresh</Button>}
    filters={<div role="group" aria-label="Workshop dates" className="flex flex-wrap gap-2">
      {whenOptions.map(option => <Button key={option.value} variant={search.when === option.value ? "default" : "outline"}
        aria-pressed={search.when === option.value}
        onClick={() => void navigate({ search: { ...search, when: option.value, offset: 0 } })}>{option.label}</Button>)}
    </div>}>
    <CrmReadState pending={runs.isPending} error={runs.error} retry={() => void runs.refetch()}
      loadingMessage="Loading scheduled workshops…" accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage} />
    {!runs.isError && runs.data && <>
      {runs.data.items.length === 0 ? <EmptyState>No scheduled workshops match these dates.</EmptyState> : <>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{search.when === "past" ? "Past workshops" : search.when === "all" ? "All scheduled workshops" : "Upcoming workshops"}</h2>
          <p className="text-sm text-muted-foreground">{search.when === "past" ? "Workshops that have ended in Manila time." : "Reserved seats include Paid and Unpaid registrations until staff cancel them."}</p>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Workshop</TableHead><TableHead>Schedule</TableHead><TableHead>Venue</TableHead><TableHead>Seats</TableHead><TableHead>Payment</TableHead></TableRow></TableHeader>
          <TableBody>{runs.data.items.map(run => <TableRow key={run.id}>
            <TableCell className="whitespace-normal py-5">
              <Link to="/registrations/sessions/$sessionId" params={{ sessionId: run.id }}
                search={{ tab: "overview", filter: "active", search: "", offset: 0, runWhen: search.when, runOffset: search.offset, runLimit: search.limit }}
                className="font-medium underline underline-offset-4">{run.workshopTitle}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{run.courseCode || "No course code"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge display={SESSION_STATUS_DISPLAY[run.status]} />
                {search.when === "all" && <Badge variant="outline">{hasSessionEnded(run) ? "Past" : "Upcoming"}</Badge>}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal py-5">{formatDateRange(run.date, run.endDate)}<p className="mt-1 text-xs text-muted-foreground">{formatTimeRange(run.startTime, run.endTime)}</p></TableCell>
            <TableCell className="whitespace-normal py-5">{run.venueName || "Venue not set"}<p className="mt-1 text-xs text-muted-foreground">{run.city}</p></TableCell>
            <TableCell className="py-5"><p><span className="font-medium tabular-nums">{run.counts.reserved} / {run.capacity}</span> reserved</p><p className="mt-1 text-xs text-muted-foreground">{run.counts.remaining} remaining</p></TableCell>
            <TableCell className="py-5"><p className="tabular-nums">{run.counts.paid} paid</p><p className="mt-1 text-xs text-muted-foreground tabular-nums">{run.counts.unpaid} unpaid</p></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </>}
      <CrmTablePagination limit={search.limit} offset={search.offset} count={runs.data.items.length}
        hasMore={runs.data.hasMore} fetching={runs.isFetching}
        onChange={page => void navigate({ search: { ...search, ...page } })} />
    </>}
  </ContentListPage>;
}
