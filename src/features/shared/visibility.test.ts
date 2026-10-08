import { describe, expect, it } from "vitest";

import { isRegistrationOpen, isUpcomingSession } from "@/features/shared/visibility";

const session = {
  status: "open",
  date: "2026-10-09",
  endDate: "2026-10-09",
  startTime: "09:00:00",
  endTime: "17:00:00",
  registrationCutoffAt: null
};

/* 2026-10-09 12:00 in Manila */
const midSession = new Date("2026-10-09T12:00:00+08:00");
const dayBefore = new Date("2026-10-08T12:00:00+08:00");

describe("isUpcomingSession", () => {
  it("keeps open and closed sessions that haven't ended", () => {
    expect(isUpcomingSession(session, dayBefore)).toBe(true);
    expect(isUpcomingSession({ ...session, status: "closed" }, dayBefore)).toBe(true);
  });

  it("drops draft and cancelled sessions", () => {
    expect(isUpcomingSession({ ...session, status: "draft" }, dayBefore)).toBe(false);
    expect(isUpcomingSession({ ...session, status: "cancelled" }, dayBefore)).toBe(false);
  });

  it("drops a session that ended earlier today", () => {
    const evening = new Date("2026-10-09T18:00:00+08:00");
    expect(isUpcomingSession(session, evening)).toBe(false);
  });

  it("keeps a multi-day session until its last day ends", () => {
    const multiDay = { ...session, endDate: "2026-10-10" };
    const firstEvening = new Date("2026-10-09T18:00:00+08:00");
    expect(isUpcomingSession(multiDay, firstEvening)).toBe(true);
  });
});

describe("isRegistrationOpen", () => {
  it("is open before the session starts when there is no cutoff", () => {
    expect(isRegistrationOpen(session, dayBefore)).toBe(true);
    expect(isRegistrationOpen(session, midSession)).toBe(false);
  });

  it("closes once the cutoff passes", () => {
    const cutoff = new Date("2026-10-08T00:00:00+08:00");
    expect(isRegistrationOpen({ ...session, registrationCutoffAt: cutoff }, dayBefore)).toBe(false);
  });

  it("is never open for closed sessions", () => {
    expect(isRegistrationOpen({ ...session, status: "closed" }, dayBefore)).toBe(false);
  });
});
