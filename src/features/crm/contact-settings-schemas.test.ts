import { expect, it } from "vitest";
import { crmContactSettingsSchema } from "./contact-settings-schemas";

const values = { corporatePhone: "+63 917 123 4567", corporateReplyTo: "sales@company.test", registrationReplyTo: "registrations@company.test" };

it("normalizes one address per field and keeps a displayable phone number", () => {
  expect(crmContactSettingsSchema.parse({ ...values, corporateReplyTo: " SALES@COMPANY.TEST " })).toEqual(values);
});

it.each([
  { corporatePhone: "" }, { corporatePhone: "123" }, { corporatePhone: "+639171234567,+639181234567" },
  { corporatePhone: "1234567890123456" }, { corporatePhone: "[TEAM_PHONE]" },
  { corporateReplyTo: "" }, { corporateReplyTo: "a@company.test,b@company.test" },
  { corporateReplyTo: "sales@example.invalid" }, { registrationReplyTo: "Sales <sales@company.test>" },
  { registrationReplyTo: "a@company.test\r\nBcc: b@company.test" }, { unknown: "value" }
])("rejects invalid, multiple or placeholder contact values: %j", patch => {
  expect(crmContactSettingsSchema.safeParse({ ...values, ...patch }).success).toBe(false);
});
