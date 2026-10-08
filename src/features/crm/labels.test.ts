import { expect, it } from "vitest";
import { emailStateLabel } from "./labels";

it("distinguishes provider acceptance from delivery and keeps unsafe retries visible", () => {
  expect(emailStateLabel("sent")).toBe("Accepted by email provider");
  expect(emailStateLabel("needs_reconciliation")).toBe("Needs review before resend");
  expect(emailStateLabel("failed")).toBe("Failed");
  expect(emailStateLabel(undefined)).toBe("No email job");
});
