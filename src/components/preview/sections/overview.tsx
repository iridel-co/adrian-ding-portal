import { Check } from "lucide-react";

import { Missing } from "@/components/preview/placeholder";
import type { PreviewModel } from "@/features/preview/model";

function seatsText(capacity: number | null) {
  return capacity === null ? null : `${capacity} of ${capacity} seats left`;
}

/* Problem hook, intro, outcomes, and a sticky key facts card with the seats call to action. */
export function OverviewSection({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-12 px-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_0.75fr] lg:items-start lg:gap-16">
        <div>
          <p className="font-display text-[2rem] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">
            {model.problem ?? <Missing>Add the problem hook</Missing>}
          </p>
          <p className="mt-6 text-[1.05rem] text-muted-foreground lg:text-[1.15rem]">
            {model.intro ?? <Missing>Add an intro</Missing>}
          </p>
          <h2 className="mt-12 text-xs font-medium tracking-widest text-brand uppercase">
            You leave able to
          </h2>
          {model.outcomes.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-4">
              {model.outcomes.map((outcome, index) => (
                <li key={index} className="flex gap-3 text-[1.05rem] lg:text-[1.15rem]">
                  <Check className="mt-1 size-5 shrink-0 text-brand" />
                  {outcome}
                </li>
              ))}
            </ul>
          ) : (
            <Missing className="mt-5">Add at least one outcome</Missing>
          )}
        </div>
        <KeyFacts model={model} />
      </div>
    </section>
  );
}

function KeyFacts({ model }: { model: PreviewModel }) {
  const seats = seatsText(model.capacity);

  return (
    <aside className="lg:sticky lg:top-[calc(var(--nav-h)+3rem)] lg:self-start">
      <div className="rounded-3xl bg-card p-8 shadow-md lg:p-10">
        <dl className="flex flex-col gap-5">
          <Fact label="When">
            {model.dateText ?? <Missing>No date yet</Missing>}
            {model.timeText && (
              <span className="block text-sm text-muted-foreground">{model.timeText}</span>
            )}
          </Fact>
          <Fact label="Where">
            {model.venueName ?? <Missing>Add a venue</Missing>}
            {model.city && (
              <span className="block text-sm text-muted-foreground">{model.city}</span>
            )}
            {model.venueMapUrl && (
              <span className="block text-sm text-brand underline">View map</span>
            )}
          </Fact>
          <Fact label="Investment">
            <span className="text-3xl font-bold tracking-tight lg:text-4xl">
              {model.priceText ? `${model.priceText}*` : <Missing>Add a price</Missing>}
            </span>
            {model.priceNote && (
              <span className="block text-sm text-muted-foreground">*{model.priceNote}</span>
            )}
          </Fact>
        </dl>
        <div className="mt-8 rounded-lg bg-brand/10 px-4 py-3 text-sm font-medium text-brand">
          {seats ?? <Missing>Add a capacity</Missing>}
        </div>
        <span className="mt-4 flex w-full justify-center rounded-full bg-brand px-6 py-3.5 font-medium text-brand-foreground">
          Reserve your seat
        </span>
        <p className="mt-4 text-xs text-muted-foreground">
          No payment on this page. We hold your seat for 48 hours after you register.
        </p>
      </div>
    </aside>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 text-[1.05rem]">{children}</dd>
    </div>
  );
}
