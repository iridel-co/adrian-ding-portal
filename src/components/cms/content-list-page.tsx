import { cn } from "cn";
import { Inbox, type LucideIcon } from "lucide-react";
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

type EmptyStateProps = {
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
};

/* A card with an icon, shown in place of a list that has nothing in it. */
export function EmptyState({ icon: Icon = Inbox, className, children }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-xs ring-1 ring-foreground/10",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5" />
      </div>
      <p>{children}</p>
    </div>
  );
}
