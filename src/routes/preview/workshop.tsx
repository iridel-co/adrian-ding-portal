import { createFileRoute } from "@tanstack/react-router";

import { PreviewLayout } from "@/components/preview/preview-layout";
import { usePreviewPayload } from "@/components/preview/use-preview-payload";
import { WorkshopCardPreview } from "@/components/preview/workshop-card";
import { WorkshopPage } from "@/components/preview/workshop-page";

export const Route = createFileRoute("/preview/workshop")({
  head: () => ({ meta: [{ title: "Preview" }] }),
  component: WorkshopPreviewPage
});

function WorkshopPreviewPage() {
  const state = usePreviewPayload();
  const payload = state.kind === "ready" ? state.payload : null;
  const model = payload?.content.kind === "workshop" ? payload.content.model : null;

  return (
    <PreviewLayout state={state} activeLink="Workshops">
      {model &&
        (payload?.view === "card" ? (
          <WorkshopCardPreview model={model} />
        ) : (
          <WorkshopPage model={model} />
        ))}
    </PreviewLayout>
  );
}
