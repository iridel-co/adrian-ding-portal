import { createFileRoute } from "@tanstack/react-router";

import { PreviewLayout } from "@/components/preview/preview-layout";
import { ProgramSectionPreview } from "@/components/preview/program-card";
import { usePreviewPayload } from "@/components/preview/use-preview-payload";

export const Route = createFileRoute("/preview/program")({
  head: () => ({ meta: [{ title: "Preview" }] }),
  component: ProgramPreviewPage
});

function ProgramPreviewPage() {
  const state = usePreviewPayload();
  const content = state.kind === "ready" ? state.payload.content : null;

  return (
    <PreviewLayout state={state} activeLink="Corporate Training">
      {content?.kind === "program" && (
        <ProgramSectionPreview cards={content.cards} editedIndex={content.editedIndex} />
      )}
    </PreviewLayout>
  );
}
