import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CrmReadState } from "@/components/crm/read-state";
import { $crmAccess } from "@/features/crm/functions";

export const Route = createFileRoute("/_app/inquiries")({
  beforeLoad: () => $crmAccess(),
  errorComponent: ({ error, reset }) => <CrmReadState pending={false} error={error} retry={reset} />,
  component: Outlet
});
