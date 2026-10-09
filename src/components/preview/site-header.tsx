import { Menu } from "lucide-react";

import { NAV_LINKS } from "@/components/preview/sample-content";

/* The public site top bar: full nav from md, a menu button below md. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 h-(--nav-h) border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-6 sm:px-10">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand font-display text-lg text-brand-foreground">
          AD
        </span>
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <span key={link} className="text-[0.9375rem] text-foreground/80">
              {link}
            </span>
          ))}
          <span className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground">
            Train with Me
          </span>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <span className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
            Train with Me
          </span>
          <span className="flex size-10 items-center justify-center" aria-label="Menu">
            <Menu className="size-5" />
          </span>
        </div>
      </div>
    </header>
  );
}
