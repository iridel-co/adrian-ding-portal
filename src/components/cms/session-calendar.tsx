import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Clock, Users, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useState, type ReactNode } from "react";

import { SESSION_STATUS_DISPLAY } from "@/components/cms/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/features/shared/format";
import { sessionsQueryOptions } from "@/features/sessions/functions";
import { manilaToday } from "@/features/shared/time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SessionStatus = keyof typeof SESSION_STATUS_DISPLAY;

/*
  Tile colors match the status badges: amber draft, green open, gray closed,
  red cancelled. The left edge carries the color so it shows even at a glance.
*/
const TILE_TONES: Record<SessionStatus, string> = {
  draft: "border-amber-500 bg-amber-50 hover:bg-amber-100 dark:bg-amber-400/10 dark:hover:bg-amber-400/20",
  open: "border-emerald-500 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/20",
  closed: "border-muted-foreground/40 bg-muted hover:bg-muted/70",
  cancelled: "border-destructive bg-destructive/5 hover:bg-destructive/10"
};

const LEGEND_DOTS: Record<SessionStatus, string> = {
  draft: "bg-amber-500",
  open: "bg-emerald-500",
  closed: "bg-muted-foreground/40",
  cancelled: "bg-destructive"
};

/* A small white chip for one detail on a tile, like the start time. */
function TileChip({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <span title={title} className="inline-flex items-center gap-0.5 rounded-full border bg-card px-1.5 text-[10px] leading-4 text-muted-foreground tabular-nums">
      <Icon aria-hidden="true" className="size-2.5" />
      {children}
    </span>
  );
}
const DAYS_PER_WEEK = 7;

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* Every day cell for the month grid, with leading and trailing blanks to fill whole weeks. */
function monthCells(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${month}-${day}`;
  });
  const leading = Array.from({ length: firstWeekday }, () => null);
  const filledCount = (leading.length + days.length) % DAYS_PER_WEEK;
  const trailingCount = (DAYS_PER_WEEK - filledCount) % DAYS_PER_WEEK;
  const trailing = Array.from({ length: trailingCount }, () => null);

  return [...leading, ...days, ...trailing];
}

export function SessionCalendar() {
  const today = manilaToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const sessions = useQuery(sessionsQueryOptions({ when: "all", month }));

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h2 className="text-lg font-medium">{monthLabel}</h2>
          <ul aria-label="Colors" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(Object.keys(SESSION_STATUS_DISPLAY) as SessionStatus[]).map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-2 rounded-full", LEGEND_DOTS[status])} />
                {SESSION_STATUS_DISPLAY[status].label}
              </li>
            ))}
            <li>Faded: already happened</li>
          </ul>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => setMonth(today.slice(0, 7))}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-lg border bg-card shadow-xs">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="border-b bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
          {monthCells(month).map((date, index) => (
            <div
              key={date ?? `blank-${index}`}
              className={cn(
                "min-h-24 border-b border-l p-1.5 [&:nth-child(7n+1)]:border-l-0",
                !date && "bg-muted/30"
              )}
            >
              {date && (
                <>
                  <div
                    className={cn(
                      "mb-1 text-xs text-muted-foreground",
                      date === today && "font-semibold text-foreground"
                    )}
                  >
                    {Number(date.slice(8))}
                  </div>
                  <div className="flex flex-col gap-1">
                    {sessions.isPending && <Skeleton className="h-8 w-full" />}
                    {sessions.data?.items
                      .filter((session) => session.date <= date && date <= session.endDate)
                      .map((session) => (
                        <Link
                          key={session.id}
                          to="/content/sessions/$id"
                          params={{ id: session.id }}
                          className={cn(
                            "flex flex-col gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-xs transition-colors",
                            TILE_TONES[session.status],
                            session.isPast && "opacity-60"
                          )}
                        >
                          <span
                            className={cn(
                              "line-clamp-2 font-medium",
                              session.status === "cancelled" && "line-through"
                            )}
                          >
                            {session.workshopTitle}
                          </span>
                          <Badge
                            variant={SESSION_STATUS_DISPLAY[session.status].variant}
                            className="h-4 bg-card px-1.5 text-[10px]"
                          >
                            {SESSION_STATUS_DISPLAY[session.status].label}
                          </Badge>
                          <span className="flex flex-wrap gap-1">
                            <TileChip icon={Clock} title="Start time">{formatTime(session.startTime)}</TileChip>
                            <TileChip
                              icon={Users}
                              title={`${session.reservedCount} of ${session.capacity} seats reserved`}
                            >
                              {session.reservedCount}/{session.capacity}
                            </TileChip>
                          </span>
                        </Link>
                      ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
