import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ban, CalendarDays, Lock, LockOpen, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { ContentListPage, EmptyState, FilterSelect, FilterTabs } from "@/components/cms/content-list-page";
import { NewSessionDialog } from "@/components/cms/new-session-dialog";
import { SessionCalendar } from "@/components/cms/session-calendar";
import {
  PAST_DISPLAY,
  SESSION_STATUS_DISPLAY,
  StatusBadge
} from "@/components/cms/status-badge";
import { type ActionTone, QuickAction } from "@/components/quick-action";
import { ReadState } from "@/components/table/read-state";
import { ActionsHead, countOf, RowAction, RowActions, runBulk, SelectAllHead, SelectCell, useRowSelection } from "@/components/table/row-actions";
import { SelectionBar } from "@/components/table/selection-bar";
import { nextSort } from "@/components/table/sort-search";
import { SortableTableHead } from "@/components/table/sortable-table-head";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { TableCard } from "@/components/table/table-card";
import { TablePagination } from "@/components/table/table-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow, tableRowLinkClass } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sessionStatus } from "@/db/schema";
import { errorMessage } from "@/features/shared/error-message";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";
import { paginationSearchSchema, sortDirection } from "@/features/shared/pagination";
import { sessionListSort } from "@/features/sessions/schemas";
import { $setSessionStatus, type SessionListItem, sessionsQueryOptions } from "@/features/sessions/functions";
import { allowedSessionTransitions, type SessionStatus } from "@/features/sessions/status";
import { hasSessionStarted } from "@/features/shared/time";
import { workshopsQueryOptions } from "@/features/workshops/functions";

const searchSchema = z
  .object({
    workshopId: z.uuid().optional().catch(undefined),
    create: z.boolean().optional(),
    when: z.enum(["upcoming", "past", "all"]).catch("upcoming").default("upcoming"),
    status: z.enum(["any", ...sessionStatus.enumValues]).catch("any").default("any"),
    sort: sessionListSort.optional().catch(undefined),
    direction: sortDirection.catch("desc")
  })
  .and(paginationSearchSchema);

type SessionSearch = z.output<typeof searchSchema>;
type SessionSort = NonNullable<SessionSearch["sort"]>;

export const Route = createFileRoute("/_app/content/sessions/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sessions" }] }),
  component: SessionsPage
});

type WhenFilter = SessionSearch["when"];
type StatusFilter = SessionSearch["status"];

const WHEN_OPTIONS: { value: WhenFilter; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All dates" }
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "any", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" }
];

const ALL_WORKSHOPS = "all";

const COLUMNS: { key: SessionSort; label: string; className?: string }[] = [
  { key: "date", label: "Date" },
  { key: "workshopTitle", label: "Workshop", className: "hidden sm:table-cell" },
  { key: "venueName", label: "Venue", className: "hidden md:table-cell" },
  { key: "priceCentavos", label: "Price", className: "hidden lg:table-cell" },
  { key: "capacity", label: "Capacity", className: "hidden lg:table-cell" },
  { key: "status", label: "Status" }
];

function SessionsPage() {
  const search = Route.useSearch();

  /* The List/Calendar switch sits next to the main action, so the status tabs are the only filter row. */
  return (
    <Tabs defaultValue="list" className="block">
      <ContentListPage
        title="Sessions"
        description="The dates each workshop runs. A session can last one day or several days in a row."
        action={
          <div className="flex items-center gap-3">
            <TabsList aria-label="View">
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
            <NewSessionDialog defaultWorkshopId={search.workshopId} defaultOpen={search.create} />
          </div>
        }
      >
        <TabsContent value="list">
          <SessionList />
        </TabsContent>
        <TabsContent value="calendar">
          <SessionCalendar />
        </TabsContent>
      </ContentListPage>
    </Tabs>
  );
}

function SessionList() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const updateSearch = (changes: Partial<SessionSearch>) =>
    void navigate({ search: { ...search, ...changes } });

  const workshops = useQuery(workshopsQueryOptions({ status: "active" }));
  const sessions = useQuery(
    sessionsQueryOptions({
      when: search.when,
      status: search.status,
      workshopId: search.workshopId,
      sort: search.sort,
      direction: search.direction,
      limit: search.limit,
      offset: search.offset
    })
  );

  const selection = useRowSelection(sessions.data?.items ?? []);
  const actions = useSessionActions(selection.clear);

  const workshopOptions = [
    { value: ALL_WORKSHOPS, label: "All workshops" },
    ...(workshops.data?.items ?? []).map((item) => ({ value: item.id, label: item.title }))
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Status"
          value={search.status}
          options={STATUS_OPTIONS}
          onChange={(status) => updateSearch({ status, offset: 0 })}
        />
        <div className="flex flex-wrap gap-3 sm:ml-auto">
          <FilterSelect
            label="When"
            value={search.when}
            options={WHEN_OPTIONS}
            onChange={(when) => updateSearch({ when, offset: 0 })}
          />
          <FilterSelect
            label="Workshop"
            value={search.workshopId ?? ALL_WORKSHOPS}
            options={workshopOptions}
            onChange={(workshopId) =>
              updateSearch({
                workshopId: workshopId === ALL_WORKSHOPS ? undefined : workshopId,
                offset: 0
              })
            }
          />
        </div>
      </div>

      <ReadState
        pending={sessions.isPending}
        error={sessions.error}
        retry={() => void sessions.refetch()}
        loadingMessage="Loading sessions…"
        skeleton={<TableSkeleton columns={COLUMNS} />}
        errorMessage={errorMessage}
      />
      {sessions.data && (
        <TableCard>
          {selection.selected.length > 0 && (
            <SelectionBar count={selection.selected.length} total={selection.total} onSelectAll={selection.selectAll} onClear={selection.clear}>
              {SESSION_ACTIONS.map((action) => {
                const fits = selection.selected.filter((session) => allowedFor(session).includes(action.to));
                if (fits.length === 0) return null;
                return (
                  <QuickAction key={action.to} icon={action.icon} tone={action.tone} disabled={actions.isBusy} onClick={() => actions.choose(action, fits)}>
                    {fits.length < selection.selected.length ? `${action.short} ${fits.length}` : action.short}
                  </QuickAction>
                );
              })}
            </SelectionBar>
          )}
          {sessions.data.items.length === 0 ? (
            <EmptyState icon={CalendarDays}>No sessions match these filters.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SelectAllHead selection={selection} label="Select all sessions on this page" />
                  {COLUMNS.map((column) => (
                    <SortableTableHead
                      key={column.key}
                      className={column.className}
                      active={search.sort === column.key}
                      direction={search.direction}
                      onClick={() => updateSearch(nextSort(search, column.key))}
                    >
                      {column.label}
                    </SortableTableHead>
                  ))}
                  <ActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data.items.map((session) => (
                  <TableRow key={session.id} data-state={selection.isSelected(session.id) ? "selected" : undefined}>
                    <SelectCell checked={selection.isSelected(session.id)} onChange={(checked) => selection.toggle(session.id, checked)}
                      label={`Select ${sessionName(session)}`} />
                    <TableCell className="whitespace-normal">
                      <Link
                        to="/content/sessions/$id"
                        params={{ id: session.id }}
                        className={tableRowLinkClass}
                      >
                        {formatDateRange(session.date, session.endDate)}
                      </Link>
                      <div className="mt-0.5 text-muted-foreground">
                        {formatTimeRange(session.startTime, session.endTime)}
                      </div>
                      <div className="text-sm sm:hidden">{session.workshopTitle}</div>
                    </TableCell>
                    <TableCell className="hidden min-w-48 whitespace-normal sm:table-cell">{session.workshopTitle}</TableCell>
                    <TableCell className="hidden min-w-40 whitespace-normal text-muted-foreground md:table-cell">
                      {[session.venueName, session.city].filter(Boolean).join(", ") || "-"}
                    </TableCell>
                    <TableCell className="hidden tabular-nums lg:table-cell">
                      {formatPesos(session.priceCentavos)}
                    </TableCell>
                    <TableCell className="hidden tabular-nums lg:table-cell">{session.capacity}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge display={SESSION_STATUS_DISPLAY[session.status]} />
                        {session.isPast && <StatusBadge display={PAST_DISPLAY} />}
                      </div>
                    </TableCell>
                    <RowActions>
                      {SESSION_ACTIONS.filter((action) => allowedFor(session).includes(action.to)).map((action) => (
                        <RowAction key={action.to} icon={action.icon} label={action.label} tone={action.tone} disabled={actions.isBusy}
                          onClick={() => actions.choose(action, [session])} />
                      ))}
                    </RowActions>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination
            limit={search.limit}
            offset={search.offset}
            count={sessions.data.items.length}
            hasMore={sessions.data.hasMore}
            fetching={sessions.isFetching}
            onChange={(page) => void navigate({ search: { ...search, ...page } })}
          />
        </TableCard>
      )}
      {actions.cancelDialog}
    </div>
  );
}

type SessionAction = { to: SessionStatus; label: string; short: string; done: string; icon: LucideIcon; tone: ActionTone };

/* The status changes a session row offers. They match the session editor's status menu. */
const SESSION_ACTIONS: SessionAction[] = [
  { to: "open", label: "Open registration", short: "Open", done: "Opened", icon: LockOpen, tone: "success" },
  { to: "closed", label: "Close registration", short: "Close", done: "Closed", icon: Lock, tone: "warning" },
  { to: "cancelled", label: "Cancel session", short: "Cancel", done: "Cancelled", icon: Ban, tone: "destructive" }
];

const allowedFor = (session: SessionListItem) =>
  allowedSessionTransitions(session.status, { hasStarted: hasSessionStarted(session), hasEnded: session.isPast });
const sessionName = (session: SessionListItem) => `${session.workshopTitle}, ${formatDateRange(session.date, session.endDate)}`;

/*
  Runs status changes on session rows. Cancelling can't be undone and emails
  everyone who registered, so it asks first, like the session editor does.
*/
function useSessionActions(onDone: () => void) {
  const queryClient = useQueryClient();
  const [isBusy, setIsBusy] = useState(false);
  const [toCancel, setToCancel] = useState<SessionListItem[] | null>(null);

  const run = async (action: SessionAction, rows: SessionListItem[]) => {
    setIsBusy(true);
    await runBulk(rows, (row) => $setSessionStatus({ data: { id: row.id, status: action.to } }), {
      name: sessionName,
      done: (count) => `${action.done} ${countOf(count, "session")}.`
    });
    setIsBusy(false);
    onDone();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["workshops"] })
    ]);
  };
  const choose = (action: SessionAction, rows: SessionListItem[]) =>
    action.to === "cancelled" ? setToCancel(rows) : void run(action, rows);

  const cancelDialog = (
    <AlertDialog open={toCancel !== null} onOpenChange={(open) => !open && setToCancel(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {toCancel?.length === 1 ? "this session" : `${toCancel?.length ?? 0} sessions`}?</AlertDialogTitle>
          <AlertDialogDescription>
            Registration closes for good. The CRM notifies everyone who registered. You can't undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep {toCancel?.length === 1 ? "session" : "sessions"}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => toCancel && void run(SESSION_ACTIONS[2], toCancel)}>
            Cancel {toCancel?.length === 1 ? "session" : "sessions"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { isBusy, choose, cancelDialog };
}
