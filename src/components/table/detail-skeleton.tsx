import { Skeleton } from "@/components/ui/skeleton";

const DETAIL_FIELDS = 6;
const LIST_ROWS = 3;

function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

/* A detail page header and one section of fields, shown while the record loads. */
export function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="grid gap-4 rounded-lg border p-5 sm:grid-cols-2">
        {placeholders(DETAIL_FIELDS).map((field) => (
          <div key={field} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Placeholder entries for a stacked list, such as a history log. */
export function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {placeholders(LIST_ROWS).map((row) => (
        <Skeleton key={row} className="h-16 w-full" />
      ))}
    </div>
  );
}
