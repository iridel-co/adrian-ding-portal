import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type ContentListPageProps = {
  title: string;
  description: string;
  action?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

/* The frame for every content list: heading, main action, filters and the list itself. */
export function ContentListPage({
  title,
  description,
  action,
  filters,
  children
}: ContentListPageProps) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {filters && <div className="flex flex-col gap-3 sm:flex-row sm:items-center">{filters}</div>}
      {children}
    </div>
  );
}

type FilterOption<T extends string> = {
  value: T;
  label: string;
};

type FilterSelectProps<T extends string> = {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
};

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange
}: FilterSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger aria-label={label} className="sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>;
}
