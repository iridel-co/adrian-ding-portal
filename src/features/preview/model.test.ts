import { describe, expect, it } from "vitest";

import {
  buildSessionPreview,
  buildWorkshopPreview,
  previewPayloadSchema,
  PREVIEW_MESSAGE_TYPE,
  type SessionPreviewSource,
  type WorkshopPreviewSource
} from "@/features/preview/model";

const workshop: WorkshopPreviewSource = {
  title: " Exceptional Salesmanship ",
  tags: [{ name: "Sales" }, { name: "Customer Experience" }],
  heroMedia: { url: "https://cdn.example.com/hero.jpg", alt: "A full room" },
  summary: "Close more deals.",
  problem: "",
  intro: "A one-day workshop.",
  outcomes: ["Open strong", " ", "Close clean"],
  curriculum: ["Mindset"],
  inclusions: [],
  whatToExpect: [],
  audience: "",
  format: "",
  primerVideoUrl: "",
  primerBlurb: "",
  defaultVenueName: "SEDA Ayala Center Cebu",
  defaultCity: "Cebu City",
  defaultVenueMapUrl: "",
  defaultPriceCentavos: 650000,
  defaultPriceNote: "VAT exclusive",
  defaultCapacity: 40
};

const session: SessionPreviewSource = {
  date: "2026-10-09",
  endDate: "2026-10-10",
  startTime: "09:00",
  endTime: "17:00",
  venueName: "Marco Polo Plaza",
  city: "Cebu City",
  venueMapUrl: "https://maps.example.com/marco-polo",
  priceCentavos: 1850000,
  priceNote: "",
  capacity: 25
};

describe("buildWorkshopPreview", () => {
  it("uses workshop defaults and trims text", () => {
    const model = buildWorkshopPreview(workshop);

    expect(model.title).toBe("Exceptional Salesmanship");
    expect(model.tags).toEqual(["Sales", "Customer Experience"]);
    expect(model.venueName).toBe("SEDA Ayala Center Cebu");
    expect(model.priceText).toBe("₱6,500");
    expect(model.capacity).toBe(40);
  });

  it("turns empty fields into null and drops blank list items", () => {
    const model = buildWorkshopPreview({ ...workshop, defaultPriceCentavos: null, heroMedia: null });

    expect(model.problem).toBeNull();
    expect(model.priceText).toBeNull();
    expect(model.heroImage).toBeNull();
    expect(model.outcomes).toEqual(["Open strong", "Close clean"]);
  });

  it("has no date without a session", () => {
    const model = buildWorkshopPreview(workshop);

    expect(model.dateText).toBeNull();
    expect(model.shortDateText).toBeNull();
    expect(model.timeText).toBeNull();
  });

  it("takes dates from the next session but keeps workshop defaults", () => {
    const model = buildWorkshopPreview(workshop, session);

    expect(model.dateText).toContain("2026");
    expect(model.venueName).toBe("SEDA Ayala Center Cebu");
    expect(model.priceText).toBe("₱6,500");
  });
});

describe("buildSessionPreview", () => {
  it("overrides venue, price and seats with session values", () => {
    const model = buildSessionPreview(workshop, session);

    expect(model.venueName).toBe("Marco Polo Plaza");
    expect(model.venueMapUrl).toBe("https://maps.example.com/marco-polo");
    expect(model.priceText).toBe("₱18,500");
    expect(model.priceNote).toBeNull();
    expect(model.capacity).toBe(25);
    expect(model.title).toBe("Exceptional Salesmanship");
  });

  it("shows the full range for a multi-day session", () => {
    const model = buildSessionPreview(workshop, session);

    expect(model.dateText).toMatch(/Oct 9, 2026 - .*Oct 10, 2026/);
    expect(model.shortDateText).toBe("Oct 9, 2026 - Oct 10, 2026");
    expect(model.timeText).toMatch(/9:00\sAM - 5:00\sPM Manila time/);
  });

  it("treats an empty end date as a one-day session", () => {
    const model = buildSessionPreview(workshop, { ...session, endDate: "" });

    expect(model.shortDateText).toBe("Oct 9, 2026");
  });

  it("has no time text when a time is missing", () => {
    const model = buildSessionPreview(workshop, { ...session, endTime: "" });

    expect(model.timeText).toBeNull();
  });
});

describe("previewPayloadSchema", () => {
  it("accepts a built model", () => {
    const payload = {
      type: PREVIEW_MESSAGE_TYPE,
      view: "page",
      model: buildSessionPreview(workshop, session)
    };

    expect(previewPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an unknown message", () => {
    expect(previewPayloadSchema.safeParse({ type: "other" }).success).toBe(false);
  });
});
