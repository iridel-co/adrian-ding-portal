import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

export type ActionTone = "default" | "success" | "info" | "warning" | "destructive";

/*
  Action colors match the status badges: green makes something live or moves it
  forward, amber puts it away or pauses it, red takes it away or ends it, and
  blue is a neutral step.
*/
export const ACTION_TONES: Record<ActionTone, string> = {
  default: "text-muted-foreground hover:text-foreground",
  success: "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300",
  info: "text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-400/10 dark:hover:text-sky-200",
  warning: "text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-400/10 dark:hover:text-amber-200",
  destructive: "text-destructive hover:bg-destructive/10 hover:text-destructive"
};

type QuickActionProps = ComponentProps<typeof Button> & {
  icon: LucideIcon;
  tone?: ActionTone;
};

/*
  An icon over a short label, for the main actions at the top right of a page
  or on a selection bar. With asChild, pass a Link and the icon goes inside it.
*/
export function QuickAction({ icon: Icon, tone = "default", className, children, ...props }: QuickActionProps) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "h-auto min-w-16 flex-col gap-1.5 rounded-xl px-3 py-2 text-xs font-medium [&_svg:not([class*='size-'])]:size-5",
        ACTION_TONES[tone],
        className
      )}
      {...props}
    >
      <Icon aria-hidden="true" />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Button>
  );
}
