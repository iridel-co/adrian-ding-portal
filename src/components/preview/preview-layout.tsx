import type { ReactNode } from "react";

import { SiteFooter } from "@/components/preview/site-footer";
import { SiteHeader } from "@/components/preview/site-header";
import type { PreviewState } from "@/components/preview/use-preview-payload";

type PreviewLayoutProps = {
  state: PreviewState;
  activeLink: string;
  children: ReactNode;
};

/* The public site header and footer around the preview content, with a message until it loads. */
export function PreviewLayout({ state, activeLink, children }: PreviewLayoutProps) {
  return (
    <div className="site-preview min-h-svh font-sans">
      <SiteHeader activeLink={activeLink} />
      <main>
        {state.kind === "ready" ? (
          children
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
