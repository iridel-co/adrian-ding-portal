import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/* Picks several active terms. Terms archived after they were picked stay, marked as archived. */
export function TermMultiPicker({ kind, value, onChange, addLabel }: TermMultiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const terms = useQuery(termsQueryOptions({ kind }));

  const selectedIds = new Set(value.map((term) => term.id));
  const available = terms.data?.filter((term) => !selectedIds.has(term.id)) ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((term) => (
        <Badge key={term.id} variant={term.isArchived ? "outline" : "secondary"} className="gap-1">
          {term.name}
          {term.isArchived && <span className="text-muted-foreground">(archived)</span>}
          <button
            type="button"
            aria-label={`Remove ${term.name}`}
            className="rounded-sm hover:text-destructive"
            onClick={() => onChange(value.filter((current) => current.id !== term.id))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus />
            {addLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search" />
            <CommandList>
              <CommandEmpty>Nothing to add. Add new ones in Settings.</CommandEmpty>
              {available.map((term) => (
                <CommandItem
                  key={term.id}
                  value={term.name}
                  onSelect={() => {
                    onChange([...value, { id: term.id, name: term.name, isArchived: false }]);
                    setIsOpen(false);
                  }}
                >
                  {term.name}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const NO_TERM = "none";

type TermSelectProps = {
  id?: string;
  kind: TaxonomyKind;
  value: PickedTerm | null;
  onChange: (term: PickedTerm | null) => void;
};

/* Picks one active term, or none. */
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
