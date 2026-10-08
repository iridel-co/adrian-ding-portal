import { afterEach, expect, test, vi } from "vitest";
import { submitCrmAction } from "./actions";

afterEach(() => vi.unstubAllGlobals());

test("a stale payment response keeps a safe conflict message instead of reporting success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "payment_status_changed" } }, { status: 409 })));
  await expect(submitCrmAction("registrations/test/payment", "PATCH", { paymentStatus: "unpaid", expectedPaymentStatus: "paid", reason: "Incorrect reference" }))
    .rejects.toMatchObject({ code: "payment_status_changed", message: expect.stringContaining("Review the refreshed status") });
});

test("an unavailable server never leaks its response text or reports a saved change", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private database failure", { status: 503 })));
  await expect(submitCrmAction("registrations/test/cancel", "POST", { reason: "Cannot attend" }))
    .rejects.toMatchObject({ code: "crm_unavailable", message: "Unable to complete the request. Refresh the record and try again." });
});

test("provider rejection is returned as failed email metadata, rather than a delivered email", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ state: "failed", lastErrorCode: "provider_request_failed" })));
  await expect(submitCrmAction("emails/test/retry", "POST", {})).resolves.toMatchObject({ state: "failed" });
});
