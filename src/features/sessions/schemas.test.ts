import { describe, expect, it } from "vitest";

import { sessionSaveSchema } from "@/features/sessions/schemas";

const valid = {
  date: "2026-10-09",
  endDate: "",
  startTime: "09:00",
  endTime: "17:00",
  venueName: "SEDA Ayala Center Cebu, E-bloc",
  city: "Cebu City",
  venueMapUrl: "",
  registrationCutoff: "",
  priceCentavos: 650000,
  priceNote: "",
  capacity: 30
};

function issuePaths(input: unknown) {
  const result = sessionSaveSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("sessionSaveSchema", () => {
  it("accepts a valid session and adds seconds to times", () => {
    const parsed = sessionSaveSchema.parse(valid);

    expect(parsed.startTime).toBe("09:00:00");
    expect(parsed.registrationCutoff).toBeNull();
    expect(parsed.venueMapUrl).toBeNull();
  });

  it("makes an empty end date the same as the start date", () => {
    expect(sessionSaveSchema.parse(valid).endDate).toBe("2026-10-09");
  });

  it("accepts a later end date for a multi-day session", () => {
    expect(sessionSaveSchema.parse({ ...valid, endDate: "2026-10-11" }).endDate).toBe("2026-10-11");
  });

  it("rejects an end date before the start date", () => {
    expect(issuePaths({ ...valid, endDate: "2026-10-08" })).toEqual(["endDate"]);
  });

  it("rejects an end time before the start time", () => {
    expect(issuePaths({ ...valid, startTime: "17:00", endTime: "09:00" })).toEqual(["endTime"]);
  });

  it("rejects a cutoff after the start", () => {
    expect(issuePaths({ ...valid, registrationCutoff: "2026-10-09T10:00" })).toEqual([
      "registrationCutoff"
    ]);
  });

  it("accepts a cutoff at the start", () => {
    expect(issuePaths({ ...valid, registrationCutoff: "2026-10-09T09:00" })).toEqual([]);
  });

  it("rejects zero capacity and a negative price", () => {
    expect(issuePaths({ ...valid, capacity: 0, priceCentavos: -1 })).toEqual([
      "priceCentavos",
      "capacity"
    ]);
  });

  it("rejects a map link that is not https", () => {
    expect(issuePaths({ ...valid, venueMapUrl: "http://maps.test" })).toEqual(["venueMapUrl"]);
  });
});
