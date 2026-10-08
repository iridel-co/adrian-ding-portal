import { describe, expect, it } from "vitest";

import { profileMediaIds, toPublicProfile } from "@/features/profile/public";

const now = new Date("2026-10-01T00:00:00Z");

const row = {
  id: "main",
  headline: "Better people build better companies.",
  tagline: "",
  roles: ["Leadership coach", "Keynote speaker"],
  shortBio: "",
  longBio: [],
  portraitMediaId: "portrait",
  emails: [],
  phone: "",
  footerTopics: [],
  corporatePrimerVideoUrl: null,
  corporatePrimerBlurb: "",
  socialLinks: [],
  stats: [
    { value: "20+", label: "Years", pages: ["home" as const, "about" as const] },
    { value: "30-day", label: "Reinforcement", pages: ["corporate" as const] }
  ],
  timeline: [{ period: "2004", title: "Certified Trainer", description: "", mediaId: "archived" }],
  credentials: [{ organization: "INSEAD", description: "2021", logoMediaId: "insead" }],
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now
};

const available = new Map([
  ["portrait", { url: "https://cdn/p.jpg", alt: "", width: null, height: null }],
  ["insead", { url: "https://cdn/i.png", alt: "INSEAD", width: null, height: null }]
]);
const mediaFor = (id: string | null | undefined) => (id ? (available.get(id) ?? null) : null);

describe("toPublicProfile", () => {
  it("returns empty defaults when the profile hasn't been saved", () => {
    const profile = toPublicProfile(undefined, mediaFor);
    expect(profile.headline).toBe("");
    expect(profile.stats).toEqual([]);
    expect(profile.portrait).toBeNull();
  });

  it("keeps only the stats for the requested page", () => {
    const profile = toPublicProfile(row, mediaFor, "about");
    expect(profile.stats.map((stat) => stat.label)).toEqual(["Years"]);
  });

  it("returns every stat when no page is given", () => {
    expect(toPublicProfile(row, mediaFor).stats).toHaveLength(2);
  });

  it("resolves nested media and nulls out archived images", () => {
    const profile = toPublicProfile(row, mediaFor);
    expect(profile.credentials[0].logo?.url).toBe("https://cdn/i.png");
    expect(profile.timeline[0].image).toBeNull();
  });
});

describe("profileMediaIds", () => {
  it("collects the portrait, timeline and credential images once each", () => {
    expect(profileMediaIds(row).sort()).toEqual(["archived", "insead", "portrait"]);
  });
});
