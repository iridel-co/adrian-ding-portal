import { cn } from "cn";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/*
  The top of a detail page: a breadcrumb, the name, a short line under it and
  the key facts on the left, with quick actions on the right.
*/
export function DetailHeader({ crumb, title, subtitle, facts, actions }: {
  crumb: ReactNode;
  title: string;
  subtitle?: ReactNode;
  facts?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {crumb}
        <h1 className="font-display text-4xl break-words">{title}</h1>
        {subtitle && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground [&_svg]:size-4">{subtitle}</div>}
        {/* Two columns on wider screens: facts fill the left column first, then the right. */}
        {facts && <dl className="mt-3 max-w-3xl text-sm sm:columns-2 sm:gap-x-12">{facts}</dl>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* The breadcrumb above a detail page title, e.g. "Workshops ›". Wrap it in a Link. */
export function Crumb({ children }: { children: ReactNode }) {
  return (
    <span className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children}
      <ChevronRight className="size-4" />
    </span>
  );
}

/* One key fact in the header: a quiet icon and label, then the value. Labels share a width so values line up. */
export function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex break-inside-avoid items-center gap-4 py-1.5">
      <dt className="flex w-36 shrink-0 items-center gap-2 text-muted-foreground"><Icon className="size-4 shrink-0" />{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2 font-medium break-words">{children}</dd>
    </div>
  );
}

/*
  A white card with an icon and title. Put InfoRows inside an InfoList.
  Write titles in Title Case, e.g. "Training Request", not "Training request".
  Use flush to let a table run edge to edge under the header.
*/
export function InfoCard({ icon: Icon, title, description, flush = false, className, children }: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn(flush && "pb-0", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn(flush && "px-0")}>{children}</CardContent>
    </Card>
  );
}

export function InfoList({ children }: { children: ReactNode }) {
  return <dl className="divide-y">{children}</dl>;
}

/* A label and value inside an InfoCard. The label is quiet so the value stands out. */
export function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4 shrink-0" />{label}</dt>
      <dd className="text-sm font-medium break-words whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

/* Tone colors match the status badges, so the same color means the same thing. */
const TIMELINE_TONES = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand/10 text-brand",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  destructive: "bg-destructive/10 text-destructive"
};

export type TimelineTone = keyof typeof TIMELINE_TONES;

/*
  One entry in an audit trail: a colored icon on a line that joins the entries,
  what happened, who did it and when, and any details underneath.
*/
export function TimelineItem({ icon: Icon, tone = "neutral", title, meta, children }: {
  icon: LucideIcon;
  tone?: TimelineTone;
  title: ReactNode;
  meta: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="group/timeline relative flex gap-4 pb-7 last:pb-0">
      <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border group-last/timeline:hidden" />
      <span className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", TIMELINE_TONES[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
        {children && <div className="mt-3 flex flex-col gap-2 text-sm">{children}</div>}
      </div>
    </li>
  );
}
