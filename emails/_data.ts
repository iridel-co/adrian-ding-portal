import type { CorporateMailConfig } from "../src/features/crm/templates";
import type { CorporateInquiryInput } from "../src/features/crm/schemas";

export const config: CorporateMailConfig = {
  EMAIL_FROM: "Adrian Ding Team <team@example.invalid>", EMAIL_REPLY_TO: "sales@example.invalid",
  CORPORATE_INQUIRY_RECIPIENTS: ["team@example.invalid"], CORPORATE_PORTAL_URL: "http://localhost:3000",
  CORPORATE_TEAM_PHONE: "+63 900 000 0000", CORPORATE_CREDIBILITY_LINE: "Practical training for your team."
};
export const id = "c59a2c85-5e3b-4567-b160-fd7155d8ec28";
export const data: CorporateInquiryInput = {
  fullName: "Ana Reyes", email: "ana@example.invalid", phone: "+639000000000", consent: true,
  company: "Sample Company", role: "HR Manager", program: "Leadership and communication", attendees: "25",
  targetDateFrom: "2026-11-23", targetDateTo: "2026-11-24", targetDateText: null, venue: "Company office, Makati",
  context: "We would like practical communication training for our team leads.", alsoInterested: ["Public speaking"]
};
export const inquiry = { id, fullName: data.fullName, company: data.company, program: data.program,
  slaDueAt: new Date("2026-11-04T09:00:00+08:00") };
export const registrant = { fullName: "Maria Santos", email: "maria@example.invalid", reference: "AD-PSW-0042",
  priceCentavos: 650000, paidAmountCentavos: 650000 };
export const course = { title: "Public Speaking Workshop", primerVideoUrl: "https://example.invalid/workshop-primer",
  primerBlurb: "Watch this short introduction before your workshop." };
export const session = { date: "2026-11-15", endDate: "2026-11-15", startTime: "09:00", endTime: "17:00",
  venueName: "Sample Training Room", city: "Makati" };
export const account = { providerName: "Sample Bank", accountName: "SAMPLE ACCOUNT (PREVIEW ONLY)", accountNumber: "TEST-ONLY" };
