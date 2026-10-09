import { Mail, Phone } from "lucide-react";

import {
  CONTACT,
  FOOTER_EXPLORE_LINKS,
  FOOTER_TAGLINE,
  SOCIAL_NETWORKS
} from "@/components/preview/sample-content";

/* The public site footer: brand, explore links and contact in a three-column grid from md. */
export function SiteFooter() {
  return (
    <footer className="bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 lg:pt-20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-[1.4fr_1fr_1fr] md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <p className="font-display text-xl sm:text-2xl">Coach Adrian Ding</p>
            <p className="mt-4 max-w-sm text-sm text-white/60">{FOOTER_TAGLINE}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {SOCIAL_NETWORKS.map((network) => (
                <span
                  key={network}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60"
                >
                  {network}
                </span>
              ))}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-medium tracking-widest text-white/40 uppercase">Explore</p>
            <ul className="mt-4 flex flex-col gap-3">
              {FOOTER_EXPLORE_LINKS.map((link) => (
                <li key={link} className="text-sm text-white/60 sm:text-[0.9375rem]">
                  {link}
                </li>
              ))}
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-medium tracking-widest text-white/40 uppercase">Contact</p>
            <ul className="mt-4 flex flex-col gap-3">
              {CONTACT.emails.map((email) => (
                <li
                  key={email}
                  className="flex items-center gap-2.5 text-sm break-all text-white/60 sm:text-[0.9375rem]"
                >
                  <Mail className="size-4 shrink-0" />
                  {email}
                </li>
              ))}
              <li className="flex items-center gap-2.5 text-sm text-white/60 sm:text-[0.9375rem]">
                <Phone className="size-4 shrink-0" />
                {CONTACT.phone}
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-center text-xs text-white/40 sm:flex-row sm:items-center sm:text-left lg:mt-14">
          <span>© {new Date().getFullYear()} Coach Adrian Ding · Maximum Impact PH</span>
          <span>Demo by iridel.com</span>
        </div>
      </div>
    </footer>
  );
}
