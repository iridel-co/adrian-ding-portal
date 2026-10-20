import { createFileRoute, redirect } from "@tanstack/react-router";
import { $crmAccess } from "@/features/crm/functions";
import { AccessErrorCode } from "@/lib/access-errors";

export const Route = createFileRoute("/_app/")({
  beforeLoad: async () => {
    let hasCrmAccess = false;
    try { await $crmAccess(); hasCrmAccess = true; }
    catch (error) {
      if (!(error instanceof Error) || error.message !== AccessErrorCode.StaffAccessRequired) throw error;
    }
    throw hasCrmAccess ? redirect({ to: "/inquiries", search: { status: "all", search: "", offset: 0 } }) : redirect({ to: "/settings/access" });
  }
});
