import { CalendarDays, MapPin } from "lucide-react";

import { Missing, PreviewImage } from "@/components/preview/placeholder";
import type { PreviewModel } from "@/features/preview/model";

export function WorkshopCard({ model }: { model: PreviewModel }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl bg-card shadow-md">
      <PreviewImage
        image={model.heroImage}
        missingLabel="Add a hero image"
        className="aspect-[4/3] w-full"
      />
      <div className="flex flex-1 flex-col p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          {model.tags.length > 0 ? (
            model.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
              >
                {tag}
              </span>
            ))
          ) : (
            <Missing className="text-xs">Add a tag</Missing>
          )}
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {model.shortDateText ?? <Missing>No date yet</Missing>}
        </p>
        <h3 className="mt-2 font-display text-[1.75rem] leading-[1.12] tracking-[-0.02em] sm:text-[2.125rem]">
          {model.title ?? <Missing>Add a title</Missing>}
        </h3>
        <p className="mt-3 text-[0.9375rem] text-muted-foreground">
          {model.summary ?? <Missing>Add a summary</Missing>}
        </p>
        <div className="mt-auto pt-6">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {model.venueName ?? <Missing>Add a venue</Missing>}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-5">
            <span className="text-xl font-semibold tabular-nums">
              {model.priceText ? `${model.priceText}*` : <Missing>Add a price</Missing>}
            </span>
            <span className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground">
              Register
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* The card on a list page background, at the column width it gets in the public grid. */
export function WorkshopCardPreview({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-muted/40 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
          Coming workshops
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <WorkshopCard model={model} />
        </div>
      </div>
    </section>
  );
}
