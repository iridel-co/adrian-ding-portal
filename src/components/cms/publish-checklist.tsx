import { Check, Circle } from "lucide-react";

import { FormSection } from "@/components/cms/form-section";
import type { PublishCheck } from "@/features/shared/publish";

type PublishChecklistProps = {
  title: string;
  checks: PublishCheck[];
};

export function PublishChecklist({ title, checks }: PublishChecklistProps) {
  const doneCount = checks.filter((check) => check.isDone).length;

  return (
    <FormSection title={title} description={`${doneCount} of ${checks.length} done`}>
      <ul className="flex flex-col gap-2 text-sm">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2">
            {check.isDone ? (
              <Check className="size-4 shrink-0 text-primary" aria-label="Done" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Missing" />
            )}
            <span className={check.isDone ? "text-muted-foreground line-through" : undefined}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </FormSection>
  );
}
