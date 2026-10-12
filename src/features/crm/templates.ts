import type { CrmEmailPayload } from "@/db/schema";
import type { CorporateInquiryInput } from "./schemas";

export type CorporateMailConfig = {
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  CORPORATE_INQUIRY_RECIPIENTS: string[];
  CORPORATE_TEAM_PHONE?: string;
  CORPORATE_CREDIBILITY_LINE?: string;
  CORPORATE_PORTAL_URL?: string;
};

export function corporateMessageHasPlaceholders(message: CrmEmailPayload) {
  return /example\.|\.invalid/i.test([message.from, ...message.to, message.replyTo ?? ""].join(" "))
    || ["[TEAM_PHONE]", "[APPROVED_CREDIBILITY_LINE]"].some(value => `${message.text ?? ""} ${message.html}`.includes(value));
}

export function corporateMessages(data: CorporateInquiryInput, id: string, config: CorporateMailConfig) {
  const targetDate = data.targetDateFrom
    ? `${data.targetDateFrom}${data.targetDateTo ? ` to ${data.targetDateTo}` : ""}` : data.targetDateText!;
  const summary = `Programme: ${data.program}\nAttendees: ${data.attendees}\nTarget date: ${targetDate}\nVenue: ${data.venue}`;
  const acknowledgment = `Hello ${data.fullName},\n\nThank you for your corporate training inquiry for ${data.company}. Our team will respond within two business days, Monday to Friday, Manila time.\n\n${summary}\n\n${config.CORPORATE_CREDIBILITY_LINE ?? "[APPROVED_CREDIBILITY_LINE]"}\n\nFor questions, reply to this email or call ${config.CORPORATE_TEAM_PHONE ?? "[TEAM_PHONE]"}.\nReference: ${id}`;
  const notification = `New corporate training inquiry\nReference: ${id}\nName: ${data.fullName}\nEmail: ${data.email}\nPhone: ${data.phone}\nCompany: ${data.company}\nRole: ${data.role}\n${summary}\nContext: ${data.context ?? "None provided"}\nAlso interested in: ${data.alsoInterested.join(", ") || "None"}\n\nView inquiry (staff sign-in required): ${config.CORPORATE_PORTAL_URL ?? "http://localhost:3000"}/inquiries/${id}`;
  function message(to: string[], subject: string, text: string): CrmEmailPayload {
    const escaped = text.replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]!);
    return { from: config.EMAIL_FROM, to, replyTo: config.EMAIL_REPLY_TO, subject, text,
      html: `<div style="white-space:pre-wrap">${escaped}</div>` };
  }
  return {
    acknowledgment: message([data.email], "We received your training inquiry", acknowledgment),
    notification: message(config.CORPORATE_INQUIRY_RECIPIENTS, "New corporate training inquiry", notification)
  };
}
