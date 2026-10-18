import { expect, it } from "vitest";
import { registrationAcknowledgmentMessage, registrationPaymentMessage, registrationMessageHasPlaceholders } from "./registration-template";
const config = { EMAIL_FROM: "Team <team@company.test>", EMAIL_REPLY_TO: "registrations@company.test",
  REGISTRATION_PAYMENT_ACCOUNT_ID: "synthetic", REGISTRATION_EMAIL_ENABLED: false, RESEND_API_KEY: "" };
const make = () => registrationPaymentMessage(config,
  { fullName: '<script>alert("x")</script>', email: "registrant@company.test", reference: "AD-PSW-0042", priceCentavos: 650050 },
  { title: "Sales & Leadership", primerVideoUrl: "https://video.company.test/primer", primerBlurb: "Before the workshop" },
  { date: "2027-01-12", endDate: "2027-01-13", startTime: "09:00:00", endTime: "17:00:00", venueName: "Training Room", city: "Cebu" },
  { providerName: "Bank", accountName: "Team", accountNumber: "123456" }, "https://media.company.test/qr.png",
  { filename: "payment-qr.png", content: "saved-base64", contentType: "image/png" });
it("includes the saved amount, reference, schedule, destination, QR and primer with proof-by-reply", () => {
  const payload = make();
  expect(payload.subject).toBe("[AD-PSW-0042] Payment information for Sales & Leadership");
  expect(payload.replyTo).toBe("registrations@company.test");
  for (const value of ["₱6,500.5", "AD-PSW-0042", "09:00 to 17:00", "Asia/Manila", "123456", "https://video.company.test/primer", "Reply to this email"])
    expect(payload.text).toContain(value);
  expect(payload.attachments?.[0].content).toBe("saved-base64");
  expect(payload.text).not.toMatch(/48.hour|expir|waiting list/i);
  expect(registrationMessageHasPlaceholders(payload)).toBe(false);
});
it("escapes customer content in HTML and identifies local placeholders", () => {
  const payload = make();
  expect(payload.html).not.toContain("<script>");
  expect(payload.html).toContain("&lt;script&gt;");
  expect(registrationMessageHasPlaceholders({ ...payload, replyTo: "registrations@example.invalid" })).toBe(true);
  expect(registrationMessageHasPlaceholders({ ...payload, text: "[PAYMENT_ACCOUNT]" })).toBe(true);
});

it("acknowledges the verified amount with reference and schedule, escapes HTML and removes subject newlines", () => {
  const payload = registrationAcknowledgmentMessage(config,
    { fullName: '<script>customer</script>', email: "customer@company.test", reference: "AD-PSW-0042", paidAmountCentavos: 123450 },
    { title: "Sales\r\n& Leadership" },
    { date: "2027-01-12", endDate: "2027-01-13", startTime: "09:00:00", endTime: "17:00:00", venueName: "Training Room", city: "Cebu" });
  expect(payload.to).toEqual(["customer@company.test"]);
  expect(payload.replyTo).toBe(config.EMAIL_REPLY_TO);
  expect(payload.subject).not.toMatch(/[\r\n]/);
  for (const text of ["AD-PSW-0042", "₱1,234.5", "now Paid", "2027-01-12", "09:00 to 17:00", "Asia/Manila", "Training Room, Cebu"])
    expect(payload.text).toContain(text);
  expect(payload.html).toContain("&lt;script&gt;customer&lt;/script&gt;");
  expect(payload.html).not.toContain("<script>");
  expect(payload.attachments).toBeUndefined();
  expect(payload.text).not.toMatch(/pay to|payment proof|refund|48.hour|expir|waiting list/i);
  expect(registrationMessageHasPlaceholders(payload)).toBe(false);
});
