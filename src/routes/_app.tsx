import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getAuthUserQueryOptions } from "@/lib/auth.queries";

/* Every route under _app/ requires a signed-in user. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(getAuthUserQueryOptions());
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: AppLayout
});

function AppLayout() {
  const { user } = Route.useRouteContext();

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
