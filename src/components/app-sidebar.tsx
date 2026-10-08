import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  Images,
  LogOut,
  Settings,
  Tags,
  Users
} from "lucide-react";

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
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/config";
import { authClient } from "@/lib/auth-client";
import { crmAccessQueryOptions } from "@/features/crm/functions";

type SidebarUser = {
  name: string;
  email: string;
  image?: string | null;
};

/* Add new pages here. */
const NAV_GROUPS = [
  {
    label: "Content",
    items: [
      { title: "Workshops", to: "/content/workshops", icon: BookOpen },
      { title: "Sessions", to: "/content/sessions", icon: CalendarDays },
      { title: "Media", to: "/content/media", icon: Images },
      { title: "Tags", to: "/content/tags", icon: Tags }
    ]
  },
  {
    label: "Settings",
    items: [
      { title: "Access", to: "/settings/access", icon: Settings },
      { title: "Industries", to: "/settings/industries", icon: Building2 }
    ]
  }
] as const;

export function AppSidebar({ user }: { user: SidebarUser }) {
  const crmAccess = useQuery(crmAccessQueryOptions());
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1 font-display text-2xl">{APP_NAME}</div>
      </SidebarHeader>
      <SidebarContent>
        {crmAccess.data === true && <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild>
            <Link to="/registrations" activeProps={{ "data-active": true }}><Users /><span>Registrations</span></Link>
          </SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent>
        </SidebarGroup>}
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <Link to={item.to} activeProps={{ "data-active": true }}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
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
            <SidebarMenuButton size="lg">
              <UserAvatar user={user} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
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
    <Avatar className="size-8 rounded-md after:rounded-md">
      {user.image && <AvatarImage className="rounded-md" src={user.image} alt={user.name} />}
      <AvatarFallback className="rounded-md">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
