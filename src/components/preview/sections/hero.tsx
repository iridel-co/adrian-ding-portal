import { ArrowLeft, CalendarDays, MapPin, Share2, Users } from "lucide-react";

import { Missing, PreviewImage } from "@/components/preview/placeholder";
import type { PreviewModel } from "@/features/preview/model";

/* Full-bleed hero image with tags, title, date, venue, seats and summary over a dark gradient. */
export function HeroSection({ model }: { model: PreviewModel }) {
  return (
    <section className="relative flex h-auto min-h-140 w-full items-end overflow-hidden bg-neutral-950 lg:min-h-[76svh]">
      <PreviewImage
        image={model.heroImage}
        missingLabel="Add a hero image"
        className="absolute inset-0 size-full"
      />
      <div className="absolute inset-0 bg-linear-to-t from-neutral-950 via-neutral-950/60 to-neutral-950/10" />
      <div className="relative mx-auto w-full max-w-7xl px-6 pt-24 pb-10 sm:px-8 lg:pb-16">
        <span className="flex items-center gap-1.5 text-sm text-white/70">
          <ArrowLeft className="size-4" />
          All workshops
        </span>
        <div className="mt-6 flex flex-wrap gap-2">
          {model.tags.length > 0 ? (
            model.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/25 px-3 py-1 text-xs font-medium text-white"
              >
                {tag}
              </span>
            ))
          ) : (
            <Missing className="text-xs text-white">Add a tag</Missing>
          )}
        </div>
        <h1 className="mt-5 max-w-4xl font-display text-[2.75rem] leading-[1.02] tracking-[-0.02em] text-white sm:text-[3.75rem] lg:text-[5rem]">
          {model.title ?? <Missing>Add a title</Missing>}
        </h1>
        <div className="mt-6 flex flex-col gap-2 text-white/80 sm:flex-row sm:flex-wrap sm:gap-x-6">
          <span className="flex items-start gap-2">
            <CalendarDays className="mt-1 size-4 shrink-0" />
            <span>
              {model.dateText ?? <Missing>No date yet</Missing>}
              {model.timeText && <span className="text-white/60"> · {model.timeText}</span>}
            </span>
          </span>
          <span className="flex items-start gap-2">
            <MapPin className="mt-1 size-4 shrink-0" />
            <span>
              {model.venueName ?? <Missing>Add a venue</Missing>}
              {model.city && <span className="text-white/60">, {model.city}</span>}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Users className="size-4 shrink-0" />
            {model.capacity === null ? (
              <Missing>Add a capacity</Missing>
            ) : (
              `${model.capacity} of ${model.capacity} seats left`
            )}
          </span>
        </div>
        <div className="mt-8 flex flex-col gap-6 border-t border-white/15 pt-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-2xl text-xl leading-[1.3] text-white/90 sm:text-2xl lg:text-[1.75rem]">
            {model.summary ?? <Missing>Add a summary</Missing>}
          </p>
          <span className="flex shrink-0 items-center gap-2 self-start rounded-full border border-white/25 px-4 py-2 text-sm text-white">
            <Share2 className="size-4" />
            Share
          </span>
        </div>
      </div>
    </section>
  );
}
