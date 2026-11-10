import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const navigate = useNavigate();
  return <Tabs value={pathname} onValueChange={value => {
    void navigate({ to: value === "/settings/contact" ? "/settings/contact" : "/settings/access" });
  }}>
    <TabsList aria-label="Settings">
      <TabsTrigger value="/settings/access">Access</TabsTrigger>
      {isAdmin && <TabsTrigger value="/settings/contact">CRM</TabsTrigger>}
    </TabsList>
  </Tabs>;
}
