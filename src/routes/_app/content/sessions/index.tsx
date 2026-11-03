import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { z } from "zod";

import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { NewSessionDialog } from "@/components/cms/new-session-dialog";
import { SessionCalendar } from "@/components/cms/session-calendar";
import {
  PAST_DISPLAY,
  SESSION_STATUS_DISPLAY,
  StatusBadge
} from "@/components/cms/status-badge";
import { ReadState } from "@/components/table/read-state";
import { nextSort } from "@/components/table/sort-search";
import { SortableTableHead } from "@/components/table/sortable-table-head";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { TablePagination } from "@/components/table/table-pagination";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sessionStatus } from "@/db/schema";
import { errorMessage } from "@/features/shared/error-message";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";
import { paginationSearchSchema, sortDirection } from "@/features/shared/pagination";
import { sessionListSort } from "@/features/sessions/schemas";
import { sessionsQueryOptions } from "@/features/sessions/functions";
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
  { value: "any", label: "Any status" },
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

  return (
    <ContentListPage
      title="Sessions"
      description="The dates each workshop runs. A session can last one day or several days in a row."
      action={
        <NewSessionDialog defaultWorkshopId={search.workshopId} defaultOpen={search.create} />
      }
    >
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <SessionList />
        </TabsContent>
        <TabsContent value="calendar">
          <SessionCalendar />
        </TabsContent>
      </Tabs>
    </ContentListPage>
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

  const workshopOptions = [
    { value: ALL_WORKSHOPS, label: "All workshops" },
    ...(workshops.data?.items ?? []).map((item) => ({ value: item.id, label: item.title }))
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterSelect
          label="When"
          value={search.when}
          options={WHEN_OPTIONS}
          onChange={(when) => updateSearch({ when, offset: 0 })}
        />
        <FilterSelect
          label="Status"
          value={search.status}
          options={STATUS_OPTIONS}
          onChange={(status) => updateSearch({ status, offset: 0 })}
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

      <ReadState
        pending={sessions.isPending}
        error={sessions.error}
        retry={() => void sessions.refetch()}
        loadingMessage="Loading sessions…"
        skeleton={<TableSkeleton columns={COLUMNS} />}
        errorMessage={errorMessage}
      />
      {sessions.data && (
        <>
          {sessions.data.items.length === 0 ? (
            <EmptyState icon={CalendarDays}>No sessions match these filters.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data.items.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        to="/content/sessions/$id"
                        params={{ id: session.id }}
                        className="font-medium underline underline-offset-4"
                      >
                        {formatDateRange(session.date, session.endDate)}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatTimeRange(session.startTime, session.endTime)}
                      </div>
                      <div className="text-sm sm:hidden">{session.workshopTitle}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{session.workshopTitle}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {[session.venueName, session.city].filter(Boolean).join(", ") || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatPesos(session.priceCentavos)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{session.capacity}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge display={SESSION_STATUS_DISPLAY[session.status]} />
                        {session.isPast && <StatusBadge display={PAST_DISPLAY} />}
                      </div>
                    </TableCell>
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
        </>
      )}
    </div>
  );
}
