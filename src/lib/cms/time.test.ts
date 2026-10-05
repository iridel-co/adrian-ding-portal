import { describe, expect, it } from "vitest";

import {
  dateToManilaLocal,
  hasSessionEnded,
  hasSessionStarted,
  manilaLocalToDate,
  manilaToday,
  manilaWallClock
} from "@/lib/cms/time";

const session = {
  date: "2026-10-09",
  endDate: "2026-10-09",
  startTime: "09:00:00",
  endTime: "17:00:00"
};

describe("manilaWallClock", () => {
  it("returns the Manila date when UTC is still on the day before", () => {
    const lateUtcEvening = new Date("2026-10-08T20:30:00Z");

    const wallClock = manilaWallClock(lateUtcEvening);

    expect(wallClock).toEqual({ date: "2026-10-09", time: "04:30:00" });
  });
});

describe("manilaToday", () => {
  it("returns the date as YYYY-MM-DD", () => {
    expect(manilaToday(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("hasSessionStarted", () => {
  it("is false one minute before the start in Manila", () => {
    expect(hasSessionStarted(session, new Date("2026-10-09T00:59:00Z"))).toBe(false);
  });

  it("is true at the start in Manila", () => {
    expect(hasSessionStarted(session, new Date("2026-10-09T01:00:00Z"))).toBe(true);
  });
});

describe("hasSessionEnded", () => {
  it("is false during the session", () => {
    expect(hasSessionEnded(session, new Date("2026-10-09T05:00:00Z"))).toBe(false);
  });

  it("is true after the end in Manila", () => {
    expect(hasSessionEnded(session, new Date("2026-10-09T09:00:00Z"))).toBe(true);
  });

  it("waits for the last day of a multi-day session", () => {
    const threeDays = { ...session, endDate: "2026-10-11" };

    expect(hasSessionEnded(threeDays, new Date("2026-10-09T09:00:00Z"))).toBe(false);
    expect(hasSessionEnded(threeDays, new Date("2026-10-11T09:00:00Z"))).toBe(true);
  });

  it("accepts times without seconds", () => {
    const formSession = { ...session, endTime: "17:00" };

    expect(hasSessionEnded(formSession, new Date("2026-10-09T09:00:00Z"))).toBe(true);
  });
});

describe("manilaLocalToDate", () => {
  it("reads the input as Manila time", () => {
    expect(manilaLocalToDate("2026-10-09T09:00").toISOString()).toBe("2026-10-09T01:00:00.000Z");
  });
});

describe("dateToManilaLocal", () => {
  it("shows an instant as Manila wall-clock time", () => {
    expect(dateToManilaLocal(new Date("2026-10-08T16:30:00Z"))).toBe("2026-10-09T00:30");
  });
});
