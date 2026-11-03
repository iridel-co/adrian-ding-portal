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
  ShieldCheck,
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
import { authClient } from "@/lib/auth-client";
import { crmAccessQueryOptions } from "@/features/crm/queries";

type SidebarUser = {
  name: string;
  email: string;
  image?: string | null;
};

/* Add new pages here. Settings sits at the bottom of the sidebar. */
const CONTENT_GROUP = {
  label: "Content",
  icon: LayoutGrid,
  items: [
    { title: "Workshops", to: "/content/workshops", icon: BookOpen },
    { title: "Sessions", to: "/content/sessions", icon: CalendarDays },
    { title: "Corporate trainings", to: "/content/corporate-trainings", icon: Briefcase },
    { title: "Media", to: "/content/media", icon: Images },
    { title: "Tags", to: "/content/tags", icon: Tags }
  ]
} as const;

const SETTINGS_GROUP = {
  label: "Settings",
  icon: Settings,
  items: [
    { title: "Access", to: "/settings/access", icon: ShieldCheck },
    { title: "Industries", to: "/settings/industries", icon: Building2 }
  ]
} as const;

const ACTIVE_PROPS = { "data-active": true } as const;

export function AppSidebar({ user }: { user: SidebarUser }) {
  const access = useQuery(crmAccessQueryOptions());
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background shadow-xs">
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
            {!access.isError && access.data && <NavGroup label="CRM" icon={Handshake} paths={["/inquiries", "/registrations"]}>
              <NavItem><Link to="/inquiries" search={{ status: "all", search: "", offset: 0 }} activeProps={ACTIVE_PROPS}><MessagesSquare /><span>Inquiries</span></Link></NavItem>
              <NavItem><Link to="/registrations" search={{ when: "upcoming", offset: 0 }} activeProps={ACTIVE_PROPS}><Users /><span>Registrations</span></Link></NavItem>
            </NavGroup>}
            <LinkGroup group={CONTENT_GROUP} />
          </SidebarMenu>
        </SidebarGroup>
        <div className="mx-4 mt-auto border-t border-dashed border-sidebar-border" />
        <SidebarGroup>
          <SidebarMenu>
            <LinkGroup group={SETTINGS_GROUP} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

function LinkGroup({ group }: { group: typeof CONTENT_GROUP | typeof SETTINGS_GROUP }) {
  return (
    <NavGroup label={group.label} icon={group.icon} paths={group.items.map((item) => item.to)}>
      {group.items.map((item) => (
        <NavItem key={item.to}>
          <Link to={item.to} activeProps={ACTIVE_PROPS}>
            <item.icon />
            <span>{item.title}</span>
          </Link>
        </NavItem>
      ))}
    </NavGroup>
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
          <SidebarMenuButton className="h-10 gap-3 rounded-xl px-3 text-[15px] [&_svg]:size-4.5">
            <Icon className={holdsCurrentPage ? "text-brand" : "text-muted-foreground"} />
            <span>{label}</span>
            <ChevronDown className="ml-auto text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </Collapsible.Trigger>
        <Collapsible.Content forceMount>
          <SidebarMenuSub className="mx-0 ml-5 py-1 pr-0 pl-3">{children}</SidebarMenuSub>
        </Collapsible.Content>
      </SidebarMenuItem>
    </Collapsible.Root>
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
