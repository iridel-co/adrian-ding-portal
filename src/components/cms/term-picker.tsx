import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Check, ChevronDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { type TaxonomyKind, termsQueryOptions } from "@/features/taxonomy/functions";

export type PickedTerm = {
  id: string;
  name: string;
  isArchived: boolean;
};

type TermMultiPickerProps = {
  kind: TaxonomyKind;
  value: PickedTerm[];
  onChange: (terms: PickedTerm[]) => void;
  addLabel: string;
};

/*
  Picks several active terms. The chosen ones show as chips in a box like an
  input; the list below ticks and unticks terms and stays open, so you can
  pick a few in one go. Terms archived after they were picked stay, marked
  as archived.
*/
export function TermMultiPicker({ kind, value, onChange, addLabel }: TermMultiPickerProps) {
  const terms = useQuery(termsQueryOptions({ kind }));
  const selectedIds = new Set(value.map((term) => term.id));

  const toggle = (term: { id: string; name: string }) =>
    onChange(
      selectedIds.has(term.id)
        ? value.filter((current) => current.id !== term.id)
        : [...value, { id: term.id, name: term.name, isArchived: false }]
    );

  return (
    <Popover>
      <PopoverAnchor asChild>
        <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-xs">
          {value.map((term) => (
            <Badge key={term.id} variant={term.isArchived ? "outline" : "neutral"} className="gap-1 pr-1">
              {term.name}
              {term.isArchived && <span className="text-muted-foreground">(archived)</span>}
              <button
                type="button"
                aria-label={`Remove ${term.name}`}
                className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onChange(value.filter((current) => current.id !== term.id))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
              <Plus />
              {addLabel}
              <ChevronDown className="opacity-60" />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>{terms.isPending ? "Loading…" : "No matches. Add new ones in Settings."}</CommandEmpty>
            {/* The group's padding keeps the first option from touching the search box. */}
            <CommandGroup>
              {(terms.data ?? []).map((term) => {
                const isPicked = selectedIds.has(term.id);
                return (
                  <CommandItem key={term.id} value={term.name} onSelect={() => toggle(term)}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        isPicked ? "border-brand bg-brand text-brand-foreground" : "border-input"
                      )}
                    >
                      {isPicked && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {term.name}
                    {isPicked && <span className="sr-only">, picked</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const NO_TERM = "none";

type TermSelectProps = {
  id?: string;
  kind: TaxonomyKind;
  value: PickedTerm | null;
  onChange: (term: PickedTerm | null) => void;
};

export function TermSelect({ id, kind, value, onChange }: TermSelectProps) {
  const terms = useQuery(termsQueryOptions({ kind }));
  const options = terms.data ?? [];
  const isValueListed = value === null || options.some((term) => term.id === value.id);

  return (
    <Select
      value={value?.id ?? NO_TERM}
      onValueChange={(next) => {
        const term = options.find((option) => option.id === next);
        onChange(term ? { id: term.id, name: term.name, isArchived: false } : null);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TERM}>None</SelectItem>
        {!isValueListed && value && (
          <SelectItem value={value.id}>{value.name} (archived)</SelectItem>
        )}
        {options.map((term) => (
          <SelectItem key={term.id} value={term.id}>
            {term.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
