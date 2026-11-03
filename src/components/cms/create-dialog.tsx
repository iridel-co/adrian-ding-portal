import { LoaderCircle, type LucideIcon, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { FormErrorList } from "@/components/cms/form-section";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type CreateDialogContentProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  submitLabel: string;
  isPending: boolean;
  canSubmit?: boolean;
  errors: string[];
  onSubmit: () => void;
  children: ReactNode;
};

/*
  The inside of every "New …" dialog: a brand-tinted header with an icon, the
  fields, any errors, and a footer with Cancel and a brand-red create button.
  Put it inside a Dialog next to its DialogTrigger.
*/
export function CreateDialogContent({
  icon: Icon,
  title,
  description,
  submitLabel,
  isPending,
  canSubmit = true,
  errors,
  onSubmit,
  children
}: CreateDialogContentProps) {
  return (
    <DialogContent className="gap-0 overflow-hidden p-0">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <DialogHeader className="flex-row items-center gap-4 border-b bg-linear-to-br from-brand/12 via-brand/5 to-transparent px-6 py-5 pr-12">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm ring-4 ring-brand/10">
            <Icon className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="font-display text-2xl leading-tight font-normal">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          {children}
          <FormErrorList messages={errors} />
        </div>

        <DialogFooter className="border-t bg-muted/40 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" variant="brand" disabled={!canSubmit || isPending}>
            {isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
