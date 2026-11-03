import { SortableTableHead } from "@/components/table/sortable-table-head";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Armchair, Ban, BookOpen, Building2, CalendarDays, ChevronRight, CircleCheck, CircleDot, Clock, Hash, Info,
  LayoutDashboard, MapPin, PencilLine, RefreshCw, TriangleAlert, Users, Wallet, type LucideIcon
} from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { TablePagination } from "@/components/table/table-pagination";
import { EmptyState, FilterSelect, SearchInput } from "@/components/cms/content-list-page";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { DetailHeader, Fact, InfoCard, InfoList, InfoRow } from "@/components/crm/detail-parts";
import { CrmReadState } from "@/components/crm/read-state";
import { DetailSkeleton } from "@/components/table/detail-skeleton";
import { SelectionBar } from "@/components/table/selection-bar";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { QuickAction } from "@/components/quick-action";
import { RegistrationBatchDialog, type BatchAction } from "@/components/crm/registration-batch-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RegistrationAction } from "@/features/crm/registration-staff-schemas";
import { RegistrationStatus } from "@/components/crm/registration-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, tableRowLinkClass } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { $getRegistrationSession, $listRegistrations } from "@/features/crm/functions";
import { formatCrmTime, isCrmAccessError } from "@/features/crm/presentation";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationSessionQueryOptions, registrationsQueryOptions } from "@/features/crm/registration-queries";
import { registrationWorkspaceSearchSchema as searchSchema } from "@/features/crm/registration-navigation";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";
import { displayCourseCode } from "@/features/workshops/course-number";

type Filter = z.output<typeof searchSchema>["filter"];
const filterOptions: { value: Filter; label: string }[] = [
  { value: "active", label: "Active (not cancelled)" }, { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All registrations" }
];

const registrantColumns = [["fullName", "Registrant"], ["status", "Status"], ["priceCentavos", "Saved price"], ["createdAt", "Submitted"]] as const;

export const Route = createFileRoute("/_app/registrations/sessions/$sessionId")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Workshop overview" }] }),
  component: RegistrationWorkspace
});

type Run = Awaited<ReturnType<typeof $getRegistrationSession>>;

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
  // The overview only needs the summary, so the list loads once the Registrations tab is open.
  const registrations = useQuery({ ...registrationsQueryOptions({ workshopSessionId: sessionId,
    filter: search.filter, search: search.search, sort: search.sort, direction: search.direction,
    offset: search.offset, limit: search.limit }), enabled: !overview && !!summary.data && !summary.isError });
  const refresh = () => { void summary.refetch(); if (!overview) void registrations.refetch(); };
  const run = summary.data;
  const accessError = [summary.error, registrations.error].find(isCrmAccessError);
  const error = accessError || summary.error;
  const listState = <CrmReadState pending={registrations.isPending} error={registrations.error}
    retry={() => void registrations.refetch()} loadingMessage="Loading registrations…"
    accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage}
    skeleton={<TableSkeleton columns={[{ label: "" }, ...registrantColumns.map(([, label]) => ({ label })), { label: "Actions" }]} />} />;
  const rows = !registrations.isError && registrations.data && (registrations.data.items.length
    ? <RegistrationRows key={`${sessionId}-${search.filter}-${search.search}-${search.offset}-${search.limit}-${search.sort}-${search.direction}`} items={registrations.data.items} search={search} />
    : <EmptyState icon={Users}>No registrations match these filters.</EmptyState>);
  const crumb = <Link to="/registrations" search={{ when: search.runWhen, status: search.runStatus, offset: search.runOffset, limit: search.runLimit, sort: search.runSort, direction: search.runDirection }}
    className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">Scheduled workshops<ChevronRight aria-hidden="true" className="size-4" /></Link>;
  // Prevent the loading state from shrinking the page and clamping its scroll position.
  return <div ref={workspace} style={{ minHeight: !error && !overview && registrations.isPending ? transitionHeight : undefined }}
    className="mx-auto flex max-w-6xl flex-col gap-6">
    {(error || !run) && crumb}
    <CrmReadState pending={summary.isPending && !accessError} error={error} retry={refresh}
      loadingMessage="Loading scheduled workshop…" accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage}
      skeleton={<DetailSkeleton />} />
    {!error && !summary.isError && run && <>
      <DetailHeader
        crumb={crumb}
        title={run.workshopTitle}
        subtitle={<><Hash />{run.courseCode ? displayCourseCode(run.courseCode) : "No course code"}</>}
        facts={<>
          <Fact icon={CircleDot} label="Status"><StatusBadge display={SESSION_STATUS_DISPLAY[run.status]} /></Fact>
          <Fact icon={CalendarDays} label="Schedule">
            <span className="rounded-full border bg-muted px-3 py-0.5">{formatDateRange(run.date, run.endDate)} · {formatTimeRange(run.startTime, run.endTime)}</span>
            <span className="font-normal text-muted-foreground">Manila time</span>
          </Fact>
          <Fact icon={MapPin} label="Venue">{run.venueName || "Venue not set"}{run.city && <span className="font-normal text-muted-foreground">· {run.city}</span>}</Fact>
        </>}
        actions={<div className="flex gap-1">
          <QuickAction icon={PencilLine} asChild><Link to="/content/sessions/$id" params={{ id: run.id }}>Edit session</Link></QuickAction>
          <QuickAction icon={RefreshCw} disabled={summary.isFetching || registrations.isFetching} onClick={refresh}>Refresh</QuickAction>
        </div>}
      />
      <Tabs value={search.tab} onValueChange={tab => { if (tab === "overview" || tab === "registrations") changeTab(tab); }}>
        <TabsList aria-label="Workshop workspace">
          <TabsTrigger value="overview"><LayoutDashboard aria-hidden="true" />Overview</TabsTrigger>
          <TabsTrigger value="registrations"><Users aria-hidden="true" />Registrations
            <span className="rounded-full bg-current/15 px-1.5 text-xs tabular-nums">{run.counts.paid + run.counts.unpaid + run.counts.cancelled}</span>
          </TabsTrigger>
        </TabsList>
        {overview ? <TabsContent value="overview" className="grid items-start gap-6 pt-4 lg:grid-cols-[3fr_2fr]">
          <SeatsCard run={run} />
          <DetailsCard run={run} />
        </TabsContent> : <TabsContent value="registrations" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={event => {
              event.preventDefault();
              const text = String(new FormData(event.currentTarget).get("search") ?? "");
              void navigate({ search: { ...search, search: text.trim(), offset: 0 } });
            }}>
              <SearchInput key={search.search} name="search" defaultValue={search.search} maxLength={200}
                aria-label="Search this scheduled workshop by reference, name or email" placeholder="Reference, name or email" />
            </form>
            <FilterSelect label="Registration status" value={search.filter} options={filterOptions}
              onChange={filter => void navigate({ search: { ...search, filter, offset: 0 } })} />
          </div>
          {listState}{rows}
          {!registrations.isError && registrations.data && <TablePagination
            limit={search.limit} offset={search.offset} count={registrations.data.items.length}
            hasMore={registrations.data.hasMore} fetching={registrations.isFetching}
            onChange={page => void navigate({ search: { ...search, ...page } })} />}
        </TabsContent>}
      </Tabs>
    </>}
  </div>;
}

const STAT_TONES = {
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  unpaid: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "bg-destructive/10 text-destructive",
  left: "bg-muted text-muted-foreground"
};

/*
  Seats at a glance: the reserved count, a bar split into paid (green) and
  unpaid (amber), and one tile per count in the same colors so they read as a legend.
*/
function SeatsCard({ run }: { run: Run }) {
  const { counts, capacity } = run;
  const share = (count: number) => capacity > 0 ? Math.min(100, Math.max(0, count / capacity * 100)) : 0;
  const paidShare = share(counts.paid);
  const reservedShare = share(counts.reserved);
  return <InfoCard icon={Armchair} title="Reserved seats"><div className="flex flex-col gap-6">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-4xl font-semibold tracking-tight tabular-nums">{counts.reserved} / {capacity} <span className="text-base font-normal tracking-normal text-muted-foreground">seats reserved</span></p>
        <Badge variant={counts.remaining > 0 ? "success" : "warning"}>{counts.remaining > 0 ? `${counts.remaining} seats left` : "Full"}</Badge>
      </div>
      <div role="progressbar" aria-label="Reserved capacity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(reservedShare)}
        aria-valuetext={`${counts.reserved} reserved out of ${capacity} seats`} className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${paidShare}%` }} />
        <div className="bg-amber-400" style={{ width: `${Math.max(0, reservedShare - paidShare)}%` }} />
      </div>
    </div>
    {counts.reserved > capacity && <p className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Reservations exceed the current capacity. Review this scheduled workshop before accepting more registrations.
    </p>}
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat icon={CircleCheck} tone={STAT_TONES.paid} label="Paid" value={counts.paid} />
      <Stat icon={Clock} tone={STAT_TONES.unpaid} label="Unpaid" value={counts.unpaid} />
      <Stat icon={Ban} tone={STAT_TONES.cancelled} label="Cancelled" value={counts.cancelled} />
      <Stat icon={Armchair} tone={STAT_TONES.left} label="Seats left" value={counts.remaining} />
    </dl>
    <p className="flex gap-2 text-sm text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Paid and Unpaid registrations reserve seats until staff cancel them. Cancelled registrations do not reserve seats.</p>
  </div></InfoCard>;
}

function Stat({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: string; label: string; value: number }) {
  return <div className="rounded-lg border p-3">
    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className={`flex size-6 items-center justify-center rounded-md ${tone}`}><Icon aria-hidden="true" className="size-3.5" /></span>{label}
    </dt>
    <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
  </div>;
}

function DetailsCard({ run }: { run: Run }) {
  return <InfoCard icon={BookOpen} title="Workshop details"><InfoList>
    <InfoRow icon={BookOpen} label="Workshop">{run.workshopTitle}</InfoRow>
    <InfoRow icon={Hash} label="Course code">{run.courseCode ? displayCourseCode(run.courseCode) : "Not set"}</InfoRow>
    <InfoRow icon={CalendarDays} label="Dates">{formatDateRange(run.date, run.endDate)}</InfoRow>
    <InfoRow icon={Clock} label="Time">{formatTimeRange(run.startTime, run.endTime)} <span className="font-normal text-muted-foreground">Manila time</span></InfoRow>
    <InfoRow icon={MapPin} label="Venue">{run.venueName || "Venue not set"}</InfoRow>
    <InfoRow icon={Building2} label="City">{run.city || "Not set"}</InfoRow>
    <InfoRow icon={Wallet} label="Price">{formatPesos(run.priceCentavos)}</InfoRow>
    <InfoRow icon={Users} label="Capacity">{run.capacity} seats</InfoRow>
  </InfoList></InfoCard>;
}

type RegistrationRow = Awaited<ReturnType<typeof $listRegistrations>>["items"][number];
function RegistrationRows({ items, search }: { items: RegistrationRow[]; search: z.output<typeof searchSchema> }) {
  const navigate = Route.useNavigate();
  const table = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<{ items: RegistrationRow[]; action: BatchAction } | null>(null);
  const eligible = items.filter(item => !item.isPaid && !item.cancelledAt);
  const chosen = eligible.filter(item => selected.includes(item.id));
  const toggle = (id: string, checked: boolean) => setSelected(current => checked ? [...current, id] : current.filter(value => value !== id));
  return <div ref={table} tabIndex={-1}>
    <p className="sr-only" aria-live="polite">{chosen.length} selected</p>
    <Card className="gap-0 py-0">
      {chosen.length > 0 && <SelectionBar count={chosen.length} total={eligible.length}
        onSelectAll={() => setSelected(eligible.map(item => item.id))} onClear={() => setSelected([])}>
        <QuickAction icon={CircleCheck} onClick={() => setBatch({ items: chosen, action: RegistrationAction.MarkPaid })}>Mark paid</QuickAction>
        <QuickAction icon={Ban} tone="destructive" onClick={() => setBatch({ items: chosen, action: RegistrationAction.Cancel })}>Cancel</QuickAction>
      </SelectionBar>}
      <Table>
        <TableHeader><TableRow>
          <TableHead><Checkbox aria-label="Select all unpaid registrations on this page" disabled={!eligible.length}
            checked={chosen.length > 0 && chosen.length === eligible.length ? true : chosen.length ? "indeterminate" : false}
            onCheckedChange={checked => setSelected(checked === true ? eligible.map(item => item.id) : [])} /></TableHead>
          {registrantColumns.map(([key, label]) =>
            <SortableTableHead key={key} active={search.sort === key} direction={search.direction}
              onClick={() => void navigate({ search: { ...search, tab: "registrations", sort: key,
                direction: search.sort === key && search.direction === "asc" ? "desc" : "asc", offset: 0 } })}>{label}</SortableTableHead>
          )}<TableHead>Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>{items.map(item => <TableRow key={item.id} data-state={chosen.some(row => row.id === item.id) ? "selected" : undefined}>
          <TableCell className="relative z-10"><Checkbox aria-label={`Select ${item.reference}`} disabled={item.isPaid || !!item.cancelledAt}
            checked={chosen.some(row => row.id === item.id)} onCheckedChange={checked => toggle(item.id, checked === true)} /></TableCell>
          <TableCell className="whitespace-normal"><Link to="/registrations/$id" params={{ id: item.id }} search={search} className={tableRowLinkClass}>{item.fullName}</Link><p className="mt-0.5 break-all text-muted-foreground">{item.email}</p><p className="text-xs text-muted-foreground">{item.phone}</p></TableCell>
          <TableCell><RegistrationStatus isPaid={item.isPaid} cancelledAt={item.cancelledAt} /></TableCell>
          <TableCell className="tabular-nums">{formatPesos(item.priceCentavos)}</TableCell><TableCell className="text-muted-foreground">{formatCrmTime(item.createdAt)}</TableCell>
          <TableCell className="relative z-10">{!item.isPaid && !item.cancelledAt && <div className="flex gap-2">
            <Button size="sm" variant="outline" aria-label={`Mark ${item.reference} Paid`}
              onClick={() => setBatch({ items: [item], action: RegistrationAction.MarkPaid })}>Mark Paid</Button>
            <Button size="sm" variant="outline" aria-label={`Cancel ${item.reference}`}
              onClick={() => setBatch({ items: [item], action: RegistrationAction.Cancel })}>Cancel</Button>
          </div>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </Card>
    {batch && <RegistrationBatchDialog items={batch.items} action={batch.action} onCloseFocus={() => table.current?.focus()} onClose={() => { setBatch(null); setSelected([]); }} />}
  </div>;
}
