import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/cms/format";
import { sessionsQueryOptions } from "@/lib/cms/sessions.functions";
import { manilaToday } from "@/lib/cms/time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{monthLabel}</h2>
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
        <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-lg border">
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
                    {sessions.data
                      ?.filter((session) => session.date <= date && date <= session.endDate)
                      .map((session) => (
                        <Link
                          key={session.id}
                          to="/content/sessions/$id"
                          params={{ id: session.id }}
                          data-status={session.status}
                          className="flex flex-col rounded bg-primary/10 px-1.5 py-0.5 text-xs hover:bg-primary/20 data-[status=cancelled]:line-through data-[status=draft]:bg-muted"
                        >
                          <span className="line-clamp-2">{session.workshopTitle}</span>
                          <span className="text-muted-foreground">
                            {formatTime(session.startTime)}
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
