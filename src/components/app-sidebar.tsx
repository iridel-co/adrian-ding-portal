import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  Ellipsis,
  Handshake,
  Images,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Settings,
  Tags,
  Users,
  type LucideIcon
} from "lucide-react";
import { Collapsible } from "radix-ui";
import type { ReactNode } from "react";

import logoUrl from "@/assets/ad-logo.svg";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { crmAccessQueryOptions } from "@/features/crm/queries";

type SidebarUser = {
  name: string;
  email: string;
  image?: string | null;
};

/* Add new pages here. */
const CONTENT_GROUP = {
  label: "Content",
  icon: LayoutGrid,
  items: [
    { title: "Workshops", to: "/content/workshops", icon: BookOpen },
    { title: "Sessions", to: "/content/sessions", icon: CalendarDays },
    { title: "Corporate trainings", to: "/content/corporate-trainings", icon: Briefcase },
    { title: "Media", to: "/content/media", icon: Images },
    { title: "Tags", to: "/content/tags", icon: Tags },
    { title: "Industries", to: "/content/industries", icon: Building2 }
  ]
} as const;

const ACTIVE_PROPS = { "data-active": true } as const;

/* Size and spacing shared by section headers and links that stand on their own. */
const TOP_LEVEL_CLASS = "h-10 gap-3 rounded-xl px-3 text-[15px] [&_svg]:size-4.5";

export function AppSidebar({ user }: { user: SidebarUser }) {
  const access = useQuery(crmAccessQueryOptions());
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-card shadow-xs">
            <img src={logoUrl} alt="Adrian Ding" className="size-8 dark:invert" />
          </div>
          <div className="grid leading-tight">
            <span className="truncate text-[15px] font-semibold">Adrian Ding</span>
            <span className="truncate text-xs text-muted-foreground">Admin portal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {access.isPending && <NavGroupSkeleton />}
            {!access.isError && access.data && <NavGroup label="CRM" icon={Handshake} paths={["/inquiries", "/registrations"]}>
              <NavItem><Link to="/inquiries" search={{ status: "all", search: "", offset: 0 }} activeProps={ACTIVE_PROPS}><MessagesSquare /><span>Inquiries</span></Link></NavItem>
              <NavItem><Link to="/registrations" search={{ when: "upcoming", offset: 0 }} activeProps={ACTIVE_PROPS}><Users /><span>Registrations</span></Link></NavItem>
            </NavGroup>}
            <NavGroup label={CONTENT_GROUP.label} icon={CONTENT_GROUP.icon} paths={CONTENT_GROUP.items.map((item) => item.to)}>
              {CONTENT_GROUP.items.map((item) => (
                <NavItem key={item.to}>
                  <Link to={item.to} activeProps={ACTIVE_PROPS}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </NavItem>
              ))}
            </NavGroup>
          </SidebarMenu>
        </SidebarGroup>
        <div className="mx-4 mt-auto border-t border-dashed border-sidebar-border" />
        <SidebarGroup>
          <SidebarMenu>
            {/* A link on its own gets a solid brand red fill when it's the current page. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className={`${TOP_LEVEL_CLASS} [&>svg]:text-muted-foreground data-active:bg-brand data-active:text-brand-foreground data-active:hover:bg-brand/90 data-active:hover:text-brand-foreground data-active:[&>svg]:text-brand-foreground`}
              >
                <Link to="/settings/access" activeProps={ACTIVE_PROPS}>
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

/*
  A section that opens and closes. It starts open, with its icon in brand red,
  when the current page is one of its links, so you can always see where you are.
*/
function NavGroup({ label, icon: Icon, paths, children }: { label: string; icon: LucideIcon; paths: readonly string[]; children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const holdsCurrentPage = paths.some((path) => pathname.startsWith(path));

  return (
    <Collapsible.Root asChild defaultOpen={holdsCurrentPage}>
      <SidebarMenuItem className="group/collapsible">
        <Collapsible.Trigger asChild>
          <SidebarMenuButton className={TOP_LEVEL_CLASS}>
            <Icon className={holdsCurrentPage ? "text-brand" : "text-muted-foreground"} />
            <span>{label}</span>
            <ChevronDown className="ml-auto text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </Collapsible.Trigger>
        <Collapsible.Content forceMount className="data-[state=closed]:hidden">
          <SidebarMenuSub className="mx-0 ml-5 py-1 pr-0 pl-3">{children}</SidebarMenuSub>
        </Collapsible.Content>
      </SidebarMenuItem>
    </Collapsible.Root>
  );
}

/* Stands in for the CRM section while we check if the user can see it. */
function NavGroupSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 px-2 py-2">
      <div className="flex items-center gap-2">
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="ml-8 h-4 w-24" />
      <Skeleton className="ml-8 h-4 w-28" />
    </div>
  );
}

/* One link inside a section. The current page gets a light red tint. */
function NavItem({ children }: { children: ReactNode }) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        className="h-9 gap-3 rounded-lg px-3 data-[size=md]:text-[15px] data-active:bg-brand/10 data-active:font-medium data-active:text-brand data-active:hover:bg-brand/15 data-active:hover:text-brand [&>svg]:text-muted-foreground data-active:[&>svg]:text-brand"
      >
        {children}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function UserMenu({ user }: { user: SidebarUser }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    await router.navigate({ to: "/login" });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="h-14 gap-3 rounded-xl">
              <UserAvatar user={user} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <Ellipsis className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserAvatar({ user }: { user: SidebarUser }) {
  return (
    <Avatar className="size-9">
      {user.image && <AvatarImage src={user.image} alt={user.name} />}
      <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
