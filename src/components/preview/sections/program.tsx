import { Check } from "lucide-react";

import { Missing } from "@/components/preview/placeholder";
import type { PreviewModel } from "@/features/preview/model";

/* Numbered curriculum modules beside the section heading from lg. */
export function CurriculumSection({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:px-8 lg:grid-cols-[0.6fr_minmax(0,1fr)] lg:gap-16">
        <h2 className="font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
          What the day covers
        </h2>
        {model.curriculum.length > 0 ? (
          <ol className="flex flex-col">
            {model.curriculum.map((item, index) => (
              <li
                key={index}
                className="flex gap-5 border-t border-border py-5 text-[1.05rem] last:border-b lg:text-[1.15rem]"
              >
                <span className="w-8 shrink-0 font-display text-2xl text-brand tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {item}
              </li>
            ))}
          </ol>
        ) : (
          <Missing>Add at least one curriculum item</Missing>
        )}
      </div>
    </section>
  );
}

/* Inclusions and what to expect, side by side from lg. */
export function InclusionsSection({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-muted/40 py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-16 px-6 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
        <CheckList
          title="What's included"
          items={model.inclusions}
          missingLabel="Add an inclusion"
        />
        <CheckList
          title="What to expect"
          items={model.whatToExpect}
          missingLabel="Add what to expect"
        />
      </div>
    </section>
  );
}

function CheckList({
  title,
  items,
  missingLabel
}: {
  title: string;
  items: string[];
  missingLabel: string;
}) {
  return (
    <div>
      <h2 className="font-display text-[1.75rem] leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]">
        {title}
      </h2>
      {items.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={index} className="flex gap-3 text-[1.05rem]">
              <Check className="mt-1 size-4 shrink-0 text-brand" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <Missing className="mt-6">{missingLabel}</Missing>
      )}
    </div>
  );
}

export function AudienceSection({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-12 px-6 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-xs font-medium tracking-widest text-brand uppercase">Who it's for</h2>
          <p className="mt-4 text-[1.3rem] text-balance lg:text-[1.45rem]">
            {model.audience ?? <Missing>Add who it's for</Missing>}
          </p>
        </div>
        <div>
          <h2 className="text-xs font-medium tracking-widest text-brand uppercase">Format</h2>
          <p className="mt-4 text-[1.3rem] text-balance lg:text-[1.45rem]">
            {model.format ?? <Missing>Add the format</Missing>}
          </p>
        </div>
      </div>
    </section>
  );
}
