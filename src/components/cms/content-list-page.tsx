import { cn } from "cn";
import { Inbox, Search, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ContentListPageProps = {
  title: string;
  description: string;
  action?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

/*
  The frame every list page shares: title and action on top, then one toolbar
  row (filter tabs on the left, search and dropdowns after), then the table.
*/
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
      {filters && <div className="flex flex-wrap items-center gap-3">{filters}</div>}
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
      <SelectTrigger aria-label={label} className="bg-card data-[size=default]:h-10 sm:w-44">
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

/* The main filter of a list page (usually status), shown as a row of pill tabs. */
export function FilterTabs<T extends string>({
  label,
  value,
  options,
  onChange
}: FilterSelectProps<T>) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList aria-label={label}>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/* A search box with a magnifier icon. Put it in a form; Enter submits. */
export function SearchInput(props: ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup className="h-10 bg-card sm:w-72">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput {...props} />
    </InputGroup>
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
        "flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-xs ring-1 ring-foreground/10 in-data-[slot=card]:rounded-none in-data-[slot=card]:shadow-none in-data-[slot=card]:ring-0",
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
