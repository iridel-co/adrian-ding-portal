import { cn } from "cn";
import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";

/* A dashed marker for a field the editor has not filled in. */
export function Missing({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md border border-dashed border-current/40 px-2 py-0.5 text-[0.8em] tracking-normal opacity-70",
        className
      )}
    >
      {children}
    </span>
  );
}

export function PreviewImage({
  image,
  missingLabel,
  className
}: {
  image: { url: string; alt: string } | null;
  missingLabel: string;
  className?: string;
}) {
  if (image) {
    return <img src={image.url} alt={image.alt} className={cn("object-cover", className)} />;
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-400/60 bg-neutral-200 text-sm text-neutral-500",
        className
      )}
    >
      <ImageIcon className="size-6" />
      {missingLabel}
    </div>
  );
}

export function SampleLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full bg-amber-100 px-2.5 py-0.5 font-sans text-[0.7rem] font-medium tracking-wide text-amber-900 uppercase",
        className
      )}
    >
      Sample content
    </span>
  );
}
