import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";

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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/config";
import { authClient } from "@/lib/auth-client";

type SidebarUser = {
  name: string;
  email: string;
  image?: string | null;
};

/* Add new pages here. */
const NAV_ITEMS = [{ title: "Settings", to: "/settings", icon: Settings }] as const;

export function AppSidebar({ user }: { user: SidebarUser }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold">{APP_NAME}</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
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
    <Avatar className="size-8 rounded-lg">
      {user.image && <AvatarImage src={user.image} alt={user.name} />}
      <AvatarFallback className="rounded-lg">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
