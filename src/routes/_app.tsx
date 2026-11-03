import { Outlet, createFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { AppSidebar, readClosedSections } from "@/components/app-sidebar";
import { ThemeSwitcher } from "@/components/theme";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { crmAccessQueryOptions } from "@/features/crm/queries";
import { readCookie } from "@/lib/cookies";
import { requireUser } from "@/lib/require-user";

/* Every route under _app/ requires a signed-in user. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    const user = await requireUser(context.queryClient);
    /*
      CRM access is checked on the server with the page, so the sidebar shows the
      CRM links on the first render. Null means no access. On later page changes
      the sidebar already knows, so this reuses its answer instead of asking again.
    */
    const crmAccessQuery = crmAccessQueryOptions();
    const crmAccess =
      typeof window === "undefined"
        ? await context.queryClient.ensureQueryData(crmAccessQuery).catch(() => null)
        : (context.queryClient.getQueryData(crmAccessQuery.queryKey) ?? null);
    return { user, crmAccess };
  },
  component: AppLayout
});

function AppLayout() {
  const { user, crmAccess } = Route.useRouteContext();

  return (
    /* The sidebar opens the way it was left. Its own cookie remembers if it was narrowed to icons. */
    <SidebarProvider
      defaultOpen={readCookie("sidebar_state") !== "false"}
      style={{ "--sidebar-width-icon": "4.5rem" } as CSSProperties}
    >
      <AppSidebar user={user} crmAccess={crmAccess} closedSections={readClosedSections()} />
      <SidebarInset className="bg-transparent">
        {/* Solid and above table buttons (z-10) and dragged rows (z-20), so nothing shows through it on scroll. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4">
          <SidebarTrigger />
          <ThemeSwitcher />
        </header>
        <main className="flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
