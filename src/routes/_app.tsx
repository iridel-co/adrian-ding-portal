import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { ThemeSwitcher } from "@/components/theme";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/require-user";

/* Every route under _app/ requires a signed-in user. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    const user = await requireUser(context.queryClient);
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
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
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
