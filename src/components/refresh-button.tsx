import { RefreshCw } from "lucide-react";

import { QuickAction } from "@/components/quick-action";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/*
  A refresh icon with a tooltip. The icon spins while the refresh is running.
  Next to other quick actions on an entity page, pass quick so it matches them:
  an icon over the word Refresh.
*/
export function RefreshButton({ onClick, isRefreshing, quick = false }: { onClick: () => void; isRefreshing: boolean; quick?: boolean }) {
  if (quick) {
    return (
      <QuickAction icon={RefreshCw} disabled={isRefreshing} onClick={onClick} className={isRefreshing ? "[&_svg]:animate-spin" : undefined}>
        Refresh
      </QuickAction>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Refresh" disabled={isRefreshing} onClick={onClick}>
          <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Refresh</TooltipContent>
    </Tooltip>
  );
}
