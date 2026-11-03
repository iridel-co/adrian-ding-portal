import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

type QuickActionProps = ComponentProps<typeof Button> & {
  icon: LucideIcon;
  tone?: "default" | "destructive";
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
        "h-auto min-w-16 flex-col gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-5",
        tone === "destructive" && "text-destructive hover:bg-destructive/10 hover:text-destructive",
        className
      )}
      {...props}
    >
      <Icon aria-hidden="true" />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Button>
  );
}
