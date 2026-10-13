import { describe, expect, it } from "vitest";
import { corporateMessageHasPlaceholders, corporateMessages, corporateOverdueMessage } from "./templates";
import { corporateInquirySchema } from "./schemas";

const data = corporateInquirySchema.parse({ fullName: "Test <Lead>", email: "lead@example.invalid", phone: "+639171234567",
  consent: true, company: "Test & Company", role: "HR Manager", program: "Leadership", attendees: "16 to 30",
  targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14", venue: "Our office", context: "<script>alert('x')</script>",
  alsoInterested: ["Communication"] });
const config = { EMAIL_FROM: "Team <team@example.invalid>", EMAIL_REPLY_TO: "sales@example.invalid",
  CORPORATE_INQUIRY_RECIPIENTS: ["primary@example.invalid", "secondary@example.invalid"],
  CORPORATE_PORTAL_URL: "https://portal.test", CORPORATE_TEAM_PHONE: "[TEAM_PHONE]", CORPORATE_CREDIBILITY_LINE: "[APPROVED_CREDIBILITY_LINE]" };

describe("Corporate E3 and N3 email content", () => {
  it("blocks old placeholder snapshots but permits ordinary brackets in submitted text", () => {
    expect(corporateMessageHasPlaceholders(corporateMessages(data, "id", config).notification)).toBe(true);
    const message = { from: "team@company.test", to: ["lead@company.test"], replyTo: "sales@company.test",
      subject: "Inquiry", text: "Context: training [team A]", html: "training [team A]" };
    expect(corporateMessageHasPlaceholders(message)).toBe(false);
    expect(corporateMessageHasPlaceholders({ ...message, text: "Call [TEAM_PHONE]" })).toBe(true);
  });
  it("acknowledges the programme, attendees, date range and venue with the response promise and placeholders", () => {
    const { acknowledgment } = corporateMessages(data, "inquiry-id", config);
    for (const text of ["two business days", "Manila time", "Leadership", "16 to 30", "2027-01-12 to 2027-01-14",
      "Our office", "[TEAM_PHONE]", "[APPROVED_CREDIBILITY_LINE]"]) expect(acknowledgment.text).toContain(text);
    expect(acknowledgment.to).toEqual([data.email]);
    expect(acknowledgment.replyTo).toBe("sales@example.invalid");
    expect(acknowledgment.html).toContain("Test &lt;Lead&gt;");
  });
  it("notifies both staff recipients with all answers, a staff link and escaped HTML", () => {
    const { notification } = corporateMessages(data, "inquiry-id", config);
    expect(notification.to).toEqual(config.CORPORATE_INQUIRY_RECIPIENTS);
    for (const text of [data.fullName, data.email, data.phone, data.company, data.role, data.program,
      data.attendees, data.venue, data.context!, "Communication", "https://portal.test/inquiries/inquiry-id"])
      expect(notification.text).toContain(text);
    expect(notification.html).not.toContain("<script>");
    expect(notification.html).toContain("&lt;script&gt;");
  });
  it("preserves a rough date description instead of inventing a date", () => {
    const { acknowledgment } = corporateMessages({ ...data, targetDateFrom: null, targetDateTo: null,
      targetDateText: "Not fixed yet; next quarter" }, "id", config);
    expect(acknowledgment.text).toContain("Not fixed yet; next quarter");
    expect(acknowledgment.text).not.toContain("2027-01-12");
  });
});

it("sends N4 only to both staff with an escaped inquiry summary and Manila deadline", () => {
  const inquiry = { id: "inquiry-id", fullName: data.fullName, company: data.company, program: data.program,
    slaDueAt: new Date("2026-10-20T02:00:00Z") };
  const message = corporateOverdueMessage(inquiry, config);
  expect(message.to).toEqual(config.CORPORATE_INQUIRY_RECIPIENTS);
  expect(message.to).not.toContain(data.email);
  expect(message.text).toContain("Manila time");
  expect(message.text).toContain("https://portal.test/inquiries/inquiry-id");
  expect(message.html).toContain("Test &lt;Lead&gt;");
  expect(message.subject).toContain("overdue");
});
