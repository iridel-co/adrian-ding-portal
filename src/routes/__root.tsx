import { type QueryClient } from "@tanstack/react-query";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";

import { ThemeInitializer } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/config";
import appCss from "@/styles/app.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex, nofollow" },
      { title: APP_NAME }
    ],
    links: [{ rel: "stylesheet", href: appCss }]
  }),
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitializer />
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors />
        <Scripts />
      </body>
    </html>
  );
}
