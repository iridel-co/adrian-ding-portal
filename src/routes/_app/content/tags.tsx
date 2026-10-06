import { createFileRoute } from "@tanstack/react-router";

import { TermsManager } from "@/components/cms/terms-manager";

export const Route = createFileRoute("/_app/content/tags")({
  head: () => ({ meta: [{ title: "Workshop tags" }] }),
  component: TagsPage
});

function TagsPage() {
  return (
    <TermsManager
      kind="workshop_tag"
      title="Workshop tags"
      description="The topics used to filter workshops on the site."
      itemLabel="tag"
      placeholder="e.g. Leadership"
    />
  );
}
