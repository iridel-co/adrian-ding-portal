import { describe, expect, it } from "vitest";

import {
  findNextSession,
  groupUpcomingSessions,
  toPublicSession
} from "@/features/workshops/public";

const now = new Date("2026-10-01T12:00:00+08:00");

function session(overrides: Partial<Parameters<typeof toPublicSession>[0]> = {}) {
  return {
    id: "s1",
    workshopId: "w1",
    date: "2026-10-09",
    endDate: "2026-10-09",
    startTime: "09:00:00",
    endTime: "17:00:00",
    venueName: "SEDA Ayala Center Cebu",
    city: "Cebu City",
    venueMapUrl: null,
    registrationCutoffAt: null,
    priceCentavos: 650000,
    priceNote: "",
    capacity: 40,
    status: "open" as const,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("toPublicSession", () => {
  it("returns Manila times without seconds and the price in centavos", () => {
    expect(toPublicSession(session(), now)).toMatchObject({
      date: "2026-10-09",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "Asia/Manila",
      venueName: "SEDA Ayala Center Cebu",
      price: { centavos: 650000, currency: "PHP", note: "" },
      isRegistrationOpen: true
    });
  });
});

describe("groupUpcomingSessions", () => {
  it("drops past, draft and cancelled sessions and sorts by start", () => {
    const grouped = groupUpcomingSessions(
      [
        session({ id: "late", date: "2026-11-01", endDate: "2026-11-01" }),
        session({ id: "early" }),
        session({ id: "past", date: "2026-09-01", endDate: "2026-09-01" }),
        session({ id: "cancelled", status: "cancelled" }),
        session({ id: "draft", status: "draft" })
      ],
      now
    );

    expect(grouped.get("w1")?.map((item) => item.id)).toEqual(["early", "late"]);
  });
});

describe("findNextSession", () => {
  it("picks the earliest open session, skipping closed ones", () => {
    const grouped = groupUpcomingSessions(
      [
        session({ id: "closed", status: "closed", date: "2026-10-05", endDate: "2026-10-05" }),
        session({ id: "open" })
      ],
      now
    );

    expect(findNextSession(grouped.get("w1"))?.id).toBe("open");
  });

  it("returns null when there is no open session", () => {
    expect(findNextSession([])).toBeNull();
    expect(findNextSession(undefined)).toBeNull();
  });
});
