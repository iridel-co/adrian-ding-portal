import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export type StatusDisplay = {
  label: string;
  variant: BadgeVariant;
};

export const CONTENT_STATUS_DISPLAY = {
  draft: { label: "Draft", variant: "outline" },
  published: { label: "Published", variant: "default" },
  archived: { label: "Archived", variant: "secondary" }
} as const satisfies Record<string, StatusDisplay>;

export const SESSION_STATUS_DISPLAY = {
  draft: { label: "Draft", variant: "outline" },
  open: { label: "Open", variant: "default" },
  closed: { label: "Closed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" }
} as const satisfies Record<string, StatusDisplay>;

export const PAST_DISPLAY: StatusDisplay = { label: "Past", variant: "secondary" };

export function StatusBadge({ display }: { display: StatusDisplay }) {
  return <Badge variant={display.variant}>{display.label}</Badge>;
}
