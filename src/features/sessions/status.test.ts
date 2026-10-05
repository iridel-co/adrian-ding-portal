import { describe, expect, it } from "vitest";

import { CmsValidationError } from "@/features/shared/errors";
import { allowedSessionTransitions, assertSessionTransition } from "@/features/sessions/status";

const upcoming = { hasStarted: false, hasEnded: false };
const started = { hasStarted: true, hasEnded: false };
const ended = { hasStarted: true, hasEnded: true };

describe("allowedSessionTransitions", () => {
  it("lets a draft open", () => {
    expect(allowedSessionTransitions("draft", upcoming)).toEqual(["open"]);
  });

  it("lets an open session close or cancel", () => {
    expect(allowedSessionTransitions("open", upcoming)).toEqual(["closed", "cancelled"]);
  });

  it("lets a closed session reopen only before it starts", () => {
    expect(allowedSessionTransitions("closed", upcoming)).toContain("open");
    expect(allowedSessionTransitions("closed", started)).not.toContain("open");
  });

  it("offers nothing for a cancelled session", () => {
    expect(allowedSessionTransitions("cancelled", upcoming)).toEqual([]);
  });

  it("offers nothing once the session is past", () => {
    expect(allowedSessionTransitions("open", ended)).toEqual([]);
  });
});

describe("assertSessionTransition", () => {
  it("explains why a started session can't reopen", () => {
    expect(() => assertSessionTransition("closed", "open", started)).toThrow(
      "This session has started, so it can't reopen."
    );
  });

  it("rejects skipping from draft to closed", () => {
    expect(() => assertSessionTransition("draft", "closed", upcoming)).toThrow(CmsValidationError);
  });
});
