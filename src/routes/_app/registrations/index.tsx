import { SortableTableHead } from "@/components/table/sortable-table-head";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { z } from "zod";
import { TablePagination } from "@/components/table/table-pagination";
import { ContentListPage, EmptyState } from "@/components/cms/content-list-page";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { CrmReadState } from "@/components/crm/read-state";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { paginationSearchSchema } from "@/features/shared/pagination";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationSessionsQueryOptions } from "@/features/crm/registration-queries";
import { registrationSessionListSchema } from "@/features/crm/registration-staff-schemas";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { hasSessionEnded } from "@/features/shared/time";

const searchSchema = registrationSessionListSchema.pick({ when: true, status: true, sort: true, direction: true }).and(paginationSearchSchema);
const whenOptions: { value: z.output<typeof searchSchema>["when"]; label: string }[] = [
  { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All dates" }
];
const statusOptions = ["draft", "open", "closed", "cancelled"] as const;

export const Route = createFileRoute("/_app/registrations/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Scheduled workshops" }] }),
  component: RegistrationRunsPage
});

const columns = [["workshopTitle", "Workshop"], ["status", "Status"], ["date", "Schedule"], ["venueName", "Venue"], ["reserved", "Seats"], ["paid", "Payment"]] as const;

function RegistrationRunsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const runs = useQuery(registrationSessionsQueryOptions(search));
  return <ContentListPage title="Scheduled workshops" description="Reserved seats and payment counts for each scheduled workshop. All dates and times are in Manila."
    action={<Button variant="outline" disabled={runs.isFetching} onClick={() => void runs.refetch()}>Refresh</Button>}
    filters={<div className="flex flex-wrap items-center gap-3">
      <Tabs value={search.status} onValueChange={value => {
        const status = registrationSessionListSchema.shape.status.parse(value);
        void navigate({ search: { ...search, status, ...(status === "all" ? { sort: "status", direction: "asc" } as const : {}), offset: 0 } });
      }}>
        <TabsList aria-label="Workshop status" className="p-0">
          <TabsTrigger value="all" className="h-9 px-3 py-2">All</TabsTrigger>
          {statusOptions.map(status => <TabsTrigger key={status} value={status} className="h-9 px-3 py-2">
            {SESSION_STATUS_DISPLAY[status].label}
          </TabsTrigger>)}
        </TabsList>
      </Tabs>
      <Select value={search.when} onValueChange={value => {
        const option = whenOptions.find(option => option.value === value);
        if (option) void navigate({ search: { ...search, when: option.value, offset: 0 } });
      }}>
        <SelectTrigger aria-label="Workshop dates" className="w-32 px-3 py-2"><SelectValue /></SelectTrigger>
        <SelectContent>{whenOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>}>
    <CrmReadState pending={runs.isPending} error={runs.error} retry={() => void runs.refetch()}
      loadingMessage="Loading scheduled workshops…" accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage}
      skeleton={<TableSkeleton columns={columns.map(([, label]) => ({ label }))} />} />
    {!runs.isError && runs.data && <>
      {runs.data.items.length === 0 ? <EmptyState icon={CalendarDays}>No scheduled workshops match these filters.</EmptyState> : <>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{search.when === "past" ? "Past workshops" : search.when === "all" ? "All scheduled workshops" : "Upcoming workshops"}</h2>
          {search.when !== "past" && <p className="text-sm text-muted-foreground">Reserved seats include Paid and Unpaid registrations until staff cancel them.</p>}
        </div>
        <Table>
          <TableHeader><TableRow>{columns.map(([key, label]) =>
            <SortableTableHead key={key} active={search.sort === key} direction={search.direction}
              onClick={() => void navigate({ search: { ...search, sort: key,
                direction: search.sort === key && search.direction === "asc" ? "desc" : "asc", offset: 0 } })}>{label}</SortableTableHead>
          )}</TableRow></TableHeader>
          <TableBody>{runs.data.items.map(run => <TableRow key={run.id}>
            <TableCell className="whitespace-normal py-5">
              <Link to="/registrations/sessions/$sessionId" params={{ sessionId: run.id }}
                search={{ tab: "overview", filter: "active", search: "", offset: 0, runWhen: search.when, runStatus: search.status, runOffset: search.offset, runLimit: search.limit, runSort: search.sort, runDirection: search.direction }}
                className="font-medium underline underline-offset-4">{run.workshopTitle}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{run.courseCode || "No course code"}</p>
            </TableCell>
            <TableCell className="py-5">
              <div className="flex items-center gap-2">
                <StatusBadge display={SESSION_STATUS_DISPLAY[run.status]} />
                {search.when === "all" && <Badge variant="outline">{hasSessionEnded(run) ? "Past" : "Upcoming"}</Badge>}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal py-5">{formatDateRange(run.date, run.endDate)}<p className="mt-1 text-xs text-muted-foreground">{formatTimeRange(run.startTime, run.endTime)}</p></TableCell>
            <TableCell className="whitespace-normal py-5">{run.venueName || "Venue not set"}<p className="mt-1 text-xs text-muted-foreground">{run.city}</p></TableCell>
            <TableCell className="py-5 font-medium tabular-nums">{run.counts.reserved} / {run.capacity}</TableCell>
            <TableCell className="py-5"><p className="tabular-nums">{run.counts.paid} paid</p><p className="mt-1 text-xs text-destructive tabular-nums">{run.counts.unpaid} unpaid</p></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </>}
      <TablePagination limit={search.limit} offset={search.offset} count={runs.data.items.length}
        hasMore={runs.data.hasMore} fetching={runs.isFetching}
        onChange={page => void navigate({ search: { ...search, ...page } })} />
    </>}
  </ContentListPage>;
}
