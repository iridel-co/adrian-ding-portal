import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = 4;
const SKELETON_CARDS = 8;

function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

/* Placeholder rows for a drag-to-order list, shown while its items load. */
export function SortableListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {placeholders(SKELETON_ROWS).map((row) => (
        <div key={row} className="flex items-center gap-2">
          <Skeleton className="size-6 shrink-0" />
          <Skeleton className="h-9 flex-1" />
        </div>
      ))}
    </div>
  );
}

/* Placeholder image cards, shown while the media library loads. */
type MediaGridSkeletonProps = {
  label: string;
  className: string;
  cardClassName: string;
};

export function MediaGridSkeleton({ label, className, cardClassName }: MediaGridSkeletonProps) {
  return (
    <div role="status" aria-label={label} className={className}>
      {placeholders(SKELETON_CARDS).map((card) => (
        <Skeleton key={card} className={cardClassName} />
      ))}
    </div>
  );
}
