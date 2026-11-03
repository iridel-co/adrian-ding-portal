import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { TermsManager } from "@/components/cms/terms-manager";

export const Route = createFileRoute("/_app/content/industries")({
  head: () => ({ meta: [{ title: "Client industries" }] }),
  component: IndustriesPage
});

function IndustriesPage() {
  return (
    <TermsManager
      kind="client_industry"
      title="Client industries"
      description="The groups used to filter the client logo wall."
      itemLabel="industry"
      placeholder="e.g. Finance"
      icon={Building2}
    />
  );
}
