import { Check, ClipboardCheck } from "lucide-react";

import { FormSection } from "@/components/cms/form-section";
import type { PublishCheck } from "@/features/shared/publish";

type PublishChecklistProps = {
  title: string;
  checks: PublishCheck[];
};

/*
  What's left before going live. Done items get a brand red check and are
  crossed out, and the bar fills in the same red, so progress reads at a glance.
*/
export function PublishChecklist({ title, checks }: PublishChecklistProps) {
  const doneCount = checks.filter((check) => check.isDone).length;
  const share = checks.length ? (doneCount / checks.length) * 100 : 0;

  return (
    <FormSection icon={ClipboardCheck} title={title} description={`${doneCount} of ${checks.length} done`}>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={checks.length}
        aria-valuenow={doneCount}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${share}%` }} />
      </div>
      <ul className="flex flex-col gap-2.5 text-sm">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2.5">
            {check.isDone ? (
              <span role="img" aria-label="Done" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : (
              <span role="img" aria-label="Missing" className="size-5 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/40" />
            )}
            <span className={check.isDone ? "text-brand line-through decoration-brand/40" : "font-medium"}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
      {checks.length > 0 && doneCount === checks.length && (
        <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-brand">
          All set. You can go live from the buttons at the top.
        </p>
      )}
    </FormSection>
  );
}
