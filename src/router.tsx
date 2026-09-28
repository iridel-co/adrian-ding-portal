import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "@/routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid refetching right after hydrating from the server
        staleTime: 1000 * 60 * 2
      }
    }
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Let TanStack Query decide when cached data is fresh enough
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Page not found.
      </div>
    )
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
