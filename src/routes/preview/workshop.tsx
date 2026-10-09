import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SiteFooter } from "@/components/preview/site-footer";
import { SiteHeader } from "@/components/preview/site-header";
import { WorkshopCardPreview } from "@/components/preview/workshop-card";
import { WorkshopPage } from "@/components/preview/workshop-page";
import {
  type PreviewPayload,
  PREVIEW_READY_MESSAGE,
  previewPayloadSchema
} from "@/features/preview/model";

export const Route = createFileRoute("/preview/workshop")({
  head: () => ({ meta: [{ title: "Preview" }] }),
  component: WorkshopPreviewPage
});

type PreviewState =
  | { kind: "waiting" }
  | { kind: "invalid" }
  | { kind: "ready"; payload: PreviewPayload };

function WorkshopPreviewPage() {
  const [state, setState] = useState<PreviewState>({ kind: "waiting" });

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;

      const parsed = previewPayloadSchema.safeParse(event.data);
      setState(parsed.success ? { kind: "ready", payload: parsed.data } : { kind: "invalid" });
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage(PREVIEW_READY_MESSAGE, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="site-preview min-h-svh font-sans">
      <SiteHeader />
      <main>
        {state.kind === "ready" ? (
          state.payload.view === "card" ? (
            <WorkshopCardPreview model={state.payload.model} />
          ) : (
            <WorkshopPage model={state.payload.model} />
          )
        ) : (
          <p className="mx-auto max-w-5xl px-6 py-24 text-center text-muted-foreground">
            {state.kind === "waiting"
              ? "Loading preview…"
              : "This preview could not load. Close it and open it again."}
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
