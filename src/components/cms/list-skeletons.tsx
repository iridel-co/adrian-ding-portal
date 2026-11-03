import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_CARDS = 8;

function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => index);
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
