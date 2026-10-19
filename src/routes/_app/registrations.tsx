import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CrmReadState } from "@/components/crm/read-state";
import { $crmAccess } from "@/features/crm/functions";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";

export const Route = createFileRoute("/_app/registrations")({
  beforeLoad: () => $crmAccess(),
  errorComponent: ({ error, reset }) => <CrmReadState pending={false} error={error} retry={reset}
    accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage} />,
  component: Outlet
});
