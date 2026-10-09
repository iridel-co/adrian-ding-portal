import { useEffect, useState } from "react";

import {
  type PreviewPayload,
  PREVIEW_READY_MESSAGE,
  previewPayloadSchema
} from "@/features/preview/model";

export type PreviewState =
  | { kind: "waiting" }
  | { kind: "invalid" }
  | { kind: "ready"; payload: PreviewPayload };

/* Tells the parent editor the frame is ready, then keeps the latest payload it posts. */
export function usePreviewPayload() {
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

  return state;
}
