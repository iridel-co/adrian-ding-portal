import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { BackLink } from "@/components/cms/editor-shell";
import { CrmTablePagination } from "@/components/crm/table-pagination";
import { EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { CrmReadState } from "@/components/crm/read-state";
import { RegistrationBatchDialog, type BatchAction } from "@/components/crm/registration-batch-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RegistrationAction } from "@/features/crm/registration-staff-schemas";
import { RegistrationStatus } from "@/components/crm/registration-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { $listRegistrations } from "@/features/crm/functions";
import { formatCrmTime, isCrmAccessError } from "@/features/crm/presentation";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationSessionQueryOptions, registrationsQueryOptions } from "@/features/crm/registration-queries";
import { registrationWorkspaceSearchSchema as searchSchema } from "@/features/crm/registration-navigation";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";

const filterOptions: { value: z.output<typeof searchSchema>["filter"]; label: string }[] = [
  { value: "active", label: "Active" }, { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All registrations" }
];

export const Route = createFileRoute("/_app/registrations/sessions/$sessionId")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Workshop overview" }] }),
  component: RegistrationWorkspace
});

function RegistrationWorkspace() {
  const { sessionId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const workspace = useRef<HTMLDivElement>(null);
  const [transitionHeight, setTransitionHeight] = useState<number>();
  const changeTab = (tab: "overview" | "registrations") => {
    setTransitionHeight(workspace.current?.offsetHeight);
    void navigate({ search: { ...search, tab }, resetScroll: false });
  };
  const summary = useQuery(registrationSessionQueryOptions(sessionId));
  const overview = search.tab === "overview";
  const registrations = useQuery({ ...registrationsQueryOptions({ workshopSessionId: sessionId,
    filter: overview ? "all" : search.filter, search: overview ? "" : search.search,
    offset: overview ? 0 : search.offset, limit: overview ? 5 : search.limit }), enabled: !!summary.data && !summary.isError });
  const refresh = () => { void summary.refetch(); void registrations.refetch(); };
  const run = summary.data;
  const accessError = [summary.error, registrations.error].find(isCrmAccessError);
  const error = accessError || summary.error;
  const listState = <CrmReadState pending={registrations.isPending} error={registrations.error}
    retry={() => void registrations.refetch()} loadingMessage="Loading registrations…"
    accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage} />;
  const rows = !registrations.isError && registrations.data && (registrations.data.items.length
    ? <RegistrationRows key={`${sessionId}-${search.tab}-${search.filter}-${search.search}-${search.offset}-${search.limit}`} items={registrations.data.items} search={search} />
    : <EmptyState>{overview ? "No registrations for this scheduled workshop yet." : "No registrations match these filters."}</EmptyState>);
  // Prevent the loading state from shrinking the page and clamping its scroll position.
  return <div ref={workspace} style={{ minHeight: !error && registrations.isPending ? transitionHeight : undefined }}
    className="mx-auto flex max-w-6xl flex-col gap-6">
    <div className="flex items-center justify-between gap-3">
      <Link to="/registrations" search={{ when: search.runWhen, offset: search.runOffset, limit: search.runLimit }}><BackLink>Scheduled workshops</BackLink></Link>
      <Button variant="outline" disabled={summary.isFetching || registrations.isFetching} onClick={refresh}>Refresh</Button>
    </div>
    <CrmReadState pending={summary.isPending && !accessError} error={error} retry={refresh}
      loadingMessage="Loading scheduled workshop…" accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage} />
    {!error && !summary.isError && run && <>
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">{run.courseCode || "No course code"}</p>
        <h1 className="font-display text-3xl sm:text-4xl">{run.workshopTitle}</h1>
        <StatusBadge display={SESSION_STATUS_DISPLAY[run.status]} />
        <p>{formatDateRange(run.date, run.endDate)} · {formatTimeRange(run.startTime, run.endTime)} <span className="text-muted-foreground">Manila time</span></p>
        <p className="text-sm text-muted-foreground">{run.venueName || "Venue not set"}{run.city && ` · ${run.city}`}</p>
      </header>
      <Tabs value={search.tab} onValueChange={tab => { if (tab === "overview" || tab === "registrations") changeTab(tab); }}>
        <TabsList aria-label="Workshop workspace"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="registrations">Registrations</TabsTrigger></TabsList>
        {overview ? <TabsContent value="overview" className="space-y-8 pt-4">
          <section aria-labelledby="reserved-heading" className="space-y-4 rounded-lg border p-5">
            <h2 id="reserved-heading" className="text-lg font-semibold">Reserved seats</h2>
            <p className="text-2xl font-medium tabular-nums">{run.counts.reserved} / {run.capacity} <span className="text-sm font-normal text-muted-foreground">reserved</span></p>
            <Progress aria-label="Reserved capacity" value={Math.min(100, Math.max(0, run.counts.reserved / run.capacity * 100))}
              aria-valuetext={`${run.counts.reserved} reserved out of ${run.capacity} seats`} />
            {run.counts.reserved > run.capacity && <p className="text-sm text-destructive">Reservations exceed the current capacity. Review this scheduled workshop before accepting more registrations.</p>}
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Remaining</dt><dd className="mt-1 text-xl tabular-nums">{run.counts.remaining}</dd></div>
              <div><dt className="text-muted-foreground">Paid</dt><dd className="mt-1 text-xl tabular-nums">{run.counts.paid}</dd></div>
              <div><dt className="text-muted-foreground">Unpaid</dt><dd className="mt-1 text-xl tabular-nums">{run.counts.unpaid}</dd></div>
              <div><dt className="text-muted-foreground">Cancelled</dt><dd className="mt-1 text-xl tabular-nums">{run.counts.cancelled}</dd></div>
            </dl>
            <p className="text-sm text-muted-foreground">Paid and Unpaid registrations reserve seats until staff cancel them. Cancelled registrations do not reserve seats.</p>
          </section>
          <section aria-labelledby="recent-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="recent-heading" className="text-lg font-semibold">Recent registrations</h2>
              <Button variant="outline" onClick={() => changeTab("registrations")}>View all registrations</Button>
            </div>
            <p className="text-sm text-muted-foreground">Latest five submissions, including cancelled registrations.</p>
            {listState}{rows}
          </section>
        </TabsContent> : <TabsContent value="registrations" className="space-y-5 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <form className="flex gap-2" onSubmit={event => {
              event.preventDefault();
              const text = String(new FormData(event.currentTarget).get("search") ?? "");
              void navigate({ search: { ...search, search: text.trim(), offset: 0 } });
            }}>
              <Input key={search.search} name="search" defaultValue={search.search} maxLength={200}
                aria-label="Search this scheduled workshop by reference, name or email" placeholder="Reference, name or email" />
              <Button variant="outline" type="submit">Search</Button>
            </form>
            <FilterSelect label="Registration status" options={filterOptions} value={search.filter}
              onChange={filter => void navigate({ search: { ...search, filter, offset: 0 } })} />
          </div>
          <p className="text-sm text-muted-foreground">Search covers registrations for this scheduled workshop only.</p>
          {listState}{rows}
          {!registrations.isError && registrations.data && <CrmTablePagination
            limit={search.limit} offset={search.offset} count={registrations.data.items.length}
            hasMore={registrations.data.hasMore} fetching={registrations.isFetching}
            onChange={page => void navigate({ search: { ...search, ...page } })} />}
        </TabsContent>}
      </Tabs>
    </>}
  </div>;
}

type RegistrationRow = Awaited<ReturnType<typeof $listRegistrations>>["items"][number];
function RegistrationRows({ items, search }: { items: RegistrationRow[]; search: z.output<typeof searchSchema> }) {
  const table = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<{ items: RegistrationRow[]; action: BatchAction } | null>(null);
  const eligible = items.filter(item => !item.isPaid && !item.cancelledAt);
  const chosen = eligible.filter(item => selected.includes(item.id));
  const toggle = (id: string, checked: boolean) => setSelected(current => checked ? [...current, id] : current.filter(value => value !== id));
  return <div ref={table} tabIndex={-1} className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-sm text-muted-foreground" aria-live="polite">{chosen.length} selected. Select unpaid registrations on this page.</p>
      <Button variant="outline" disabled={!chosen.length} onClick={() => setBatch({ items: chosen, action: RegistrationAction.MarkPaid })}>Mark selected Paid</Button>
      <Button variant="destructive" disabled={!chosen.length} onClick={() => setBatch({ items: chosen, action: RegistrationAction.Cancel })}>Cancel selected</Button>
    </div>
    <Table>
    <TableHeader><TableRow>
      <TableHead><Checkbox aria-label="Select all unpaid registrations on this page" disabled={!eligible.length}
        checked={chosen.length > 0 && chosen.length === eligible.length ? true : chosen.length ? "indeterminate" : false}
        onCheckedChange={checked => setSelected(checked === true ? eligible.map(item => item.id) : [])} /></TableHead>
      <TableHead>Registrant</TableHead><TableHead>Status</TableHead><TableHead>Saved price</TableHead><TableHead>Submitted</TableHead><TableHead>Actions</TableHead>
    </TableRow></TableHeader>
    <TableBody>{items.map(item => <TableRow key={item.id}>
      <TableCell><Checkbox aria-label={`Select ${item.reference}`} disabled={item.isPaid || !!item.cancelledAt}
        checked={chosen.some(row => row.id === item.id)} onCheckedChange={checked => toggle(item.id, checked === true)} /></TableCell>
      <TableCell className="whitespace-normal py-4"><Link to="/registrations/$id" params={{ id: item.id }} search={search} className="font-medium underline underline-offset-4">{item.fullName}</Link><p className="mt-1 break-all text-xs text-muted-foreground">{item.email}</p><p className="mt-1 text-xs text-muted-foreground">{item.phone}</p></TableCell>
      <TableCell><RegistrationStatus isPaid={item.isPaid} cancelledAt={item.cancelledAt} /></TableCell>
      <TableCell>{formatPesos(item.priceCentavos)}</TableCell><TableCell>{formatCrmTime(item.createdAt)}</TableCell>
      <TableCell>{!item.isPaid && !item.cancelledAt && <div className="flex gap-2">
        <Button size="sm" variant="outline" aria-label={`Mark ${item.reference} Paid`}
          onClick={() => setBatch({ items: [item], action: RegistrationAction.MarkPaid })}>Mark Paid</Button>
        <Button size="sm" variant="outline" aria-label={`Cancel ${item.reference}`}
          onClick={() => setBatch({ items: [item], action: RegistrationAction.Cancel })}>Cancel</Button>
      </div>}</TableCell>
    </TableRow>)}</TableBody>
  </Table>
  {batch && <RegistrationBatchDialog items={batch.items} action={batch.action} onCloseFocus={() => table.current?.focus()} onClose={() => { setBatch(null); setSelected([]); }} />}
  </div>;
}
