import { Badge } from "@/components/ui/badge";

type BadgeVariant = "success" | "warning" | "info" | "neutral" | "destructive";

export type StatusDisplay = {
  label: string;
  variant: BadgeVariant;
};

/* Amber means "not live yet", green means live, gray means done or off. */
export const CONTENT_STATUS_DISPLAY = {
  draft: { label: "Draft", variant: "warning" },
  published: { label: "Published", variant: "success" },
  archived: { label: "Archived", variant: "neutral" }
} as const satisfies Record<string, StatusDisplay>;

export const SESSION_STATUS_DISPLAY = {
  draft: { label: "Draft", variant: "warning" },
  open: { label: "Open", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
  cancelled: { label: "Cancelled", variant: "destructive" }
} as const satisfies Record<string, StatusDisplay>;

export const PAST_DISPLAY: StatusDisplay = { label: "Past", variant: "neutral" };

export function StatusBadge({ display }: { display: StatusDisplay }) {
  return <Badge variant={display.variant}>{display.label}</Badge>;
}
