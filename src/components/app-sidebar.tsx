import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
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
import { cn } from "cn";
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
  SidebarMenuSubItem,
  useSidebar
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { readCookie } from "@/lib/cookies";
import type { $crmAccess } from "@/features/crm/functions";
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

/* When the sidebar is narrowed to icons, a link becomes a centered square with only its icon. */
const ICON_ONLY_CLASS =
  "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:[&>span]:hidden";

const CLOSED_SECTIONS_COOKIE = "sidebar_closed_sections";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/* The sections the user closed. They're kept in a cookie so a reload shows them the same way. */
export function readClosedSections() {
  return (readCookie(CLOSED_SECTIONS_COOKIE) ?? "").split("|").filter(Boolean);
}

function rememberSection(label: string, isOpen: boolean) {
  const closed = new Set(readClosedSections());
  if (isOpen) closed.delete(label);
  else closed.add(label);
  document.cookie = `${CLOSED_SECTIONS_COOKIE}=${encodeURIComponent([...closed].join("|"))}; path=/; max-age=${ONE_YEAR_SECONDS}`;
}

function Divider({ className }: { className?: string }) {
  return <div className={cn("mx-4 border-t border-dashed border-sidebar-border", className)} />;
}

type AppSidebarProps = {
  user: SidebarUser;
  /* What the server found when it loaded the page. The sidebar keeps checking after that. */
  crmAccess: Awaited<ReturnType<typeof $crmAccess>> | null;
  closedSections: readonly string[];
};

export function AppSidebar({ user, crmAccess, closedSections }: AppSidebarProps) {
  const access = useQuery({ ...crmAccessQueryOptions(), initialData: crmAccess ?? undefined });
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 shadow-xs ring-1 ring-white/15">
            <img src={logoUrl} alt="Adrian Ding" className="size-8 invert" />
          </div>
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[15px] font-semibold">Adrian Ding</span>
            <span className="truncate text-xs text-sidebar-foreground/60">Admin portal</span>
          </div>
        </div>
      </SidebarHeader>
      <Divider />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {!access.isError && access.data && <>
              <NavGroup label="CRM" icon={Handshake} paths={["/inquiries", "/registrations", "/payment-accounts"]} closedSections={closedSections}>
                <NavItem title="Inquiries"><Link to="/inquiries" search={{ status: "all", search: "", offset: 0 }} activeProps={ACTIVE_PROPS}><MessagesSquare /><span>Inquiries</span></Link></NavItem>
                <NavItem title="Registrations"><Link to="/registrations" search={{ when: "upcoming", offset: 0 }} activeProps={ACTIVE_PROPS}><Users /><span>Registrations</span></Link></NavItem>
                <NavItem title="Payment accounts"><Link to="/payment-accounts" activeProps={ACTIVE_PROPS}><CreditCard /><span>Payment accounts</span></Link></NavItem>
              </NavGroup>
              {/* Between sections, only when the sidebar shows icons and section headers are hidden. */}
              <li aria-hidden="true" className="mx-4 my-1 hidden border-t border-dashed border-sidebar-border group-data-[collapsible=icon]:block" />
            </>}
            <NavGroup label={CONTENT_GROUP.label} icon={CONTENT_GROUP.icon} paths={CONTENT_GROUP.items.map((item) => item.to)} closedSections={closedSections}>
              {CONTENT_GROUP.items.map((item) => (
                <NavItem key={item.to} title={item.title}>
                  <Link to={item.to} activeProps={ACTIVE_PROPS}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </NavItem>
              ))}
            </NavGroup>
          </SidebarMenu>
        </SidebarGroup>
        <Divider className="mt-auto" />
        <SidebarGroup>
          <SidebarMenu>
            {/* A link on its own gets a white fill when it's the current page. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Settings"
                className={cn(
                  TOP_LEVEL_CLASS,
                  "[&>svg]:text-sidebar-foreground/60 data-active:bg-white data-active:text-brand data-active:hover:bg-white/90 data-active:hover:text-brand data-active:[&>svg]:text-brand",
                  ICON_ONLY_CLASS
                )}
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
      <SidebarFooter className="rounded-b-2xl border-t border-sidebar-border bg-black/20">
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

type NavGroupProps = {
  label: string;
  icon: LucideIcon;
  paths: readonly string[];
  closedSections: readonly string[];
  children: ReactNode;
};

/*
  A section that opens and closes. It stays the way the user left it, even after
  a reload, and its icon lights up when the current page is one of its links.
  When the sidebar shows only icons, the header hides and the links always show.
*/
function NavGroup({ label, icon: Icon, paths, closedSections, children }: NavGroupProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const holdsCurrentPage = paths.some((path) => pathname.startsWith(path));

  return (
    <Collapsible.Root
      asChild
      defaultOpen={!closedSections.includes(label)}
      onOpenChange={(isOpen) => rememberSection(label, isOpen)}
    >
      <SidebarMenuItem className="group/collapsible">
        <Collapsible.Trigger asChild>
          <SidebarMenuButton className={cn(TOP_LEVEL_CLASS, "group-data-[collapsible=icon]:hidden")}>
            <Icon className={holdsCurrentPage ? "text-sidebar-foreground" : "text-sidebar-foreground/60"} />
            <span>{label}</span>
            <ChevronDown className="ml-auto text-sidebar-foreground/50 transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </Collapsible.Trigger>
        <Collapsible.Content forceMount className="data-[state=closed]:hidden group-data-[collapsible=icon]:block!">
          <SidebarMenuSub className="mx-0 ml-5 py-1 pr-0 pl-3 group-data-[collapsible=icon]:m-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:translate-x-0 group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:p-0">
            {children}
          </SidebarMenuSub>
        </Collapsible.Content>
      </SidebarMenuItem>
    </Collapsible.Root>
  );
}

/*
  One link inside a section. The current page gets a white fill with red text.
  When the sidebar shows only icons, the name shows on hover.
*/
function NavItem({ title, children }: { title: string; children: ReactNode }) {
  const { state, isMobile } = useSidebar();
  return (
    <SidebarMenuSubItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuSubButton
            asChild
            className={cn(
              "h-9 gap-3 rounded-lg px-3 data-[size=md]:text-[15px] [&>svg]:text-sidebar-foreground/60 data-active:bg-white data-active:font-medium data-active:text-brand data-active:hover:bg-white/90 data-active:hover:text-brand data-active:[&>svg]:text-brand",
              ICON_ONLY_CLASS,
              "group-data-[collapsible=icon]:translate-x-0 group-data-[collapsible=icon]:rounded-xl"
            )}
          >
            {children}
          </SidebarMenuSubButton>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile}>
          {title}
        </TooltipContent>
      </Tooltip>
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
            <SidebarMenuButton
              size="lg"
              className="h-14 gap-3 rounded-xl group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center"
            >
              <UserAvatar user={user} />
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{user.email}</span>
              </div>
              <Ellipsis className="ml-auto text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" />
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
