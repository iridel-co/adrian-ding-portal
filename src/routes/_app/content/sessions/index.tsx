import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { NewSessionDialog } from "@/components/cms/new-session-dialog";
import { SessionCalendar } from "@/components/cms/session-calendar";
import {
  PAST_DISPLAY,
  SESSION_STATUS_DISPLAY,
  StatusBadge
} from "@/components/cms/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateRange, formatTimeRange } from "@/lib/cms/format";
import { formatPesos } from "@/lib/cms/money";
import type { SessionStatus } from "@/lib/cms/session-status";
import { sessionsQueryOptions } from "@/lib/cms/sessions.functions";
import { workshopsQueryOptions } from "@/lib/cms/workshops.functions";

const searchSchema = z.object({
  workshopId: z.uuid().optional(),
  create: z.boolean().optional()
});

export const Route = createFileRoute("/_app/content/sessions/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sessions" }] }),
  component: SessionsPage
});

type WhenFilter = "upcoming" | "past" | "all";
type StatusFilter = "any" | SessionStatus;

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
          <SessionList defaultWorkshopId={search.workshopId} />
        </TabsContent>
        <TabsContent value="calendar">
          <SessionCalendar />
        </TabsContent>
      </Tabs>
    </ContentListPage>
  );
}

function SessionList({ defaultWorkshopId }: { defaultWorkshopId?: string }) {
  const [when, setWhen] = useState<WhenFilter>("upcoming");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [workshopId, setWorkshopId] = useState(defaultWorkshopId ?? ALL_WORKSHOPS);

  const workshops = useQuery(workshopsQueryOptions({ status: "active" }));
  const sessions = useQuery(
    sessionsQueryOptions({
      when,
      status,
      workshopId: workshopId === ALL_WORKSHOPS ? undefined : workshopId
    })
  );

  const workshopOptions = [
    { value: ALL_WORKSHOPS, label: "All workshops" },
    ...(workshops.data ?? []).map((item) => ({ value: item.id, label: item.title }))
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterSelect label="When" value={when} options={WHEN_OPTIONS} onChange={setWhen} />
        <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <FilterSelect
          label="Workshop"
          value={workshopId}
          options={workshopOptions}
          onChange={setWorkshopId}
        />
      </div>

      {sessions.data?.length === 0 ? (
        <EmptyState>No sessions match these filters.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="hidden sm:table-cell">Workshop</TableHead>
              <TableHead className="hidden md:table-cell">Venue</TableHead>
              <TableHead className="hidden lg:table-cell">Price</TableHead>
              <TableHead className="hidden lg:table-cell">Capacity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.data?.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="whitespace-normal">
                  <Link
                    to="/content/sessions/$id"
                    params={{ id: session.id }}
                    className="font-medium hover:underline"
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
    </div>
  );
}
