import { PlayCircle } from "lucide-react";

import { Missing, SampleLabel } from "@/components/preview/placeholder";
import { CLIENT_LOGOS, COACH } from "@/components/preview/sample-content";
import type { PreviewModel } from "@/features/preview/model";

export function PrimerSection({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-muted/40 py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:px-8 lg:grid-cols-[0.6fr_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div>
          <h2 className="font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
            A word from Coach Adrian
          </h2>
          <p className="mt-4 text-[1.05rem] text-muted-foreground lg:text-[1.15rem]">
            {model.primerBlurb ?? <Missing>Add a primer blurb</Missing>}
          </p>
        </div>
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg bg-neutral-900 text-white/70">
          <PlayCircle className="size-14" />
          {model.primerVideoUrl ? (
            <span className="max-w-[80%] truncate text-xs">{model.primerVideoUrl}</span>
          ) : (
            <Missing className="text-xs">Add a primer video link</Missing>
          )}
        </div>
      </div>
    </section>
  );
}

/* A row of client names in the place of client logos. */
export function ClientLogosSection() {
  return (
    <section className="bg-background py-14 lg:py-20">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Trusted by teams at
          </p>
          <SampleLabel />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {CLIENT_LOGOS.map((client) => (
            <span
              key={client}
              className="font-display text-2xl text-neutral-400 grayscale sm:text-[1.6rem]"
            >
              {client}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Coach photo, bio, stats and credentials. The photo is sticky from lg. */
export function CoachSection() {
  return (
    <section className="bg-muted/40 py-20 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 sm:px-8 lg:grid-cols-[0.5fr_minmax(0,1fr)] lg:gap-20">
        <div className="relative flex aspect-[4/5] items-end overflow-hidden rounded-lg bg-linear-to-br from-neutral-300 to-neutral-500 p-6 lg:sticky lg:top-[calc(var(--nav-h)+3rem)]">
          <span className="font-display text-6xl text-white/80">AD</span>
        </div>
        <div>
          <SampleLabel />
          <h2 className="mt-4 font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3.25rem]">
            Your coach, {COACH.name}
          </h2>
          <p className="mt-4 text-[1.3rem] text-balance lg:text-[1.45rem]">{COACH.bio}</p>
          <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3">
            {COACH.stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-[1.75rem] leading-none font-semibold tracking-tighter tabular-nums sm:text-[2rem]">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 w-full rounded-lg bg-background p-6 lg:max-w-md">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Credentials
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-[0.9375rem]">
              {COACH.credentials.map((credential) => (
                <li key={credential}>{credential}</li>
              ))}
            </ul>
          </div>
          <span className="mt-8 inline-block font-medium text-brand">More about Adrian →</span>
        </div>
      </div>
    </section>
  );
}
