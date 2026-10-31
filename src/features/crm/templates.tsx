import { render } from "react-email";
import { EmailButton, EmailDetails, EmailLayout, EmailParagraph } from "./email-layout";
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

export async function corporateMessages(data: CorporateInquiryInput, id: string, config: CorporateMailConfig) {
  const targetDate = data.targetDateFrom
    ? `${data.targetDateFrom}${data.targetDateTo ? ` to ${data.targetDateTo}` : ""}` : data.targetDateText!;
  const summary = `Programme: ${data.program}\nAttendees: ${data.attendees}\nTarget date: ${targetDate}\nVenue: ${data.venue}`;
  const acknowledgment = `Hello ${data.fullName},\n\nThank you for your corporate training inquiry for ${data.company}. Our team will respond within two business days, Monday to Friday, Manila time.\n\n${summary}\n\n${config.CORPORATE_CREDIBILITY_LINE ?? "[APPROVED_CREDIBILITY_LINE]"}\n\nFor questions, reply to this email or call ${config.CORPORATE_TEAM_PHONE ?? "[TEAM_PHONE]"}.\nReference: ${id}`;
  const notification = `New corporate training inquiry\nReference: ${id}\nName: ${data.fullName}\nEmail: ${data.email}\nPhone: ${data.phone}\nCompany: ${data.company}\nRole: ${data.role}\n${summary}\nContext: ${data.context ?? "None provided"}\nAlso interested in: ${data.alsoInterested.join(", ") || "None"}\n\nView inquiry (staff sign-in required): ${config.CORPORATE_PORTAL_URL ?? "http://localhost:3000"}/inquiries/${id}`;
  const [customerHtml, staffHtml] = await Promise.all([
    render(<CorporateAcknowledgmentEmail data={data} id={id} config={config} />),
    render(<CorporateNotificationEmail data={data} id={id} config={config} />)
  ]);
  return {
    acknowledgment: corporateMessage(config, [data.email], "We received your training inquiry", acknowledgment, customerHtml),
    notification: corporateMessage(config, config.CORPORATE_INQUIRY_RECIPIENTS, "New corporate training inquiry", notification, staffHtml)
  };
}

function corporateMessage(config: CorporateMailConfig, to: string[], subject: string, text: string, html: string): CrmEmailPayload {
  return { from: config.EMAIL_FROM, to, replyTo: config.EMAIL_REPLY_TO, subject, text, html };
}

export async function corporateOverdueMessage(inquiry: { id: string; fullName: string; company: string; program: string; slaDueAt: Date }, config: CorporateMailConfig) {
  const deadline = inquiry.slaDueAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  const text =
    `The first reply to this corporate training inquiry is overdue.
Reference: ${inquiry.id}
Name: ${inquiry.fullName}
Company: ${inquiry.company}
Programme: ${inquiry.program}
Reply due: ${deadline} (Manila time)

Reply to the lead, then record the first reply in the portal.
View inquiry (staff sign-in required): ${config.CORPORATE_PORTAL_URL ?? "http://localhost:3000"}/inquiries/${inquiry.id}`;
  const html = await render(<CorporateOverdueEmail inquiry={inquiry} config={config} />);
  return corporateMessage(config, config.CORPORATE_INQUIRY_RECIPIENTS, "Corporate inquiry reply overdue", text, html);
}

function corporateDetails(data: CorporateInquiryInput): [string, string][] {
  const targetDate = data.targetDateFrom
    ? `${data.targetDateFrom}${data.targetDateTo ? ` to ${data.targetDateTo}` : ""}` : data.targetDateText!;
  return [["Programme", data.program], ["Attendees", data.attendees], ["Target date", targetDate], ["Venue", data.venue]];
}

export function CorporateAcknowledgmentEmail({ data, id, config }: {
  data: CorporateInquiryInput; id: string; config: CorporateMailConfig;
}) {
  const details = corporateDetails(data);
  return <EmailLayout preview="We received your training inquiry" label="CORPORATE TRAINING" title="We received your inquiry.">
      <EmailParagraph>Hello {data.fullName},</EmailParagraph>
      <EmailParagraph>Thank you for your corporate training inquiry for {data.company}. Our team will respond within two business days, Monday to Friday, Manila time.</EmailParagraph>
      <EmailDetails rows={details} />
      <EmailParagraph>{config.CORPORATE_CREDIBILITY_LINE ?? "[APPROVED_CREDIBILITY_LINE]"}</EmailParagraph>
      <EmailParagraph>For questions, reply to this email or call {config.CORPORATE_TEAM_PHONE ?? "[TEAM_PHONE]"}.</EmailParagraph>
      <EmailDetails rows={[["Reference", id]]} />
    </EmailLayout>;
}

export function CorporateNotificationEmail({ data, id, config }: {
  data: CorporateInquiryInput; id: string; config: CorporateMailConfig;
}) {
  const details = corporateDetails(data);
  const portalUrl = `${config.CORPORATE_PORTAL_URL ?? "http://localhost:3000"}/inquiries/${id}`;
  return <EmailLayout internal preview={`New inquiry from ${data.company}`} label="CORPORATE INQUIRIES / NEW" title="New training inquiry.">
      <EmailParagraph>{data.company} has submitted a corporate training inquiry.</EmailParagraph>
      <EmailDetails rows={[["Reference", id], ["Name", data.fullName], ["Email", data.email], ["Phone", data.phone],
        ["Company", data.company], ["Role", data.role], ...details]} />
      <EmailParagraph><strong>Context</strong>{"\n"}{data.context ?? "None provided"}</EmailParagraph>
      <EmailParagraph><strong>Also interested in</strong>{"\n"}{data.alsoInterested.join(", ") || "None"}</EmailParagraph>
      <EmailButton internal href={portalUrl}>View inquiry in the portal</EmailButton>
    </EmailLayout>;
}

export function CorporateOverdueEmail({ inquiry, config }: {
  inquiry: Parameters<typeof corporateOverdueMessage>[0]; config: CorporateMailConfig;
}) {
  const deadline = inquiry.slaDueAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  return <EmailLayout internal preview={`Reply overdue: ${inquiry.company}`} label="CORPORATE INQUIRIES / OVERDUE" title="A first reply is overdue.">
    <EmailParagraph>The first reply to this corporate training inquiry is overdue.</EmailParagraph>
    <EmailDetails rows={[["Reference", inquiry.id], ["Name", inquiry.fullName], ["Company", inquiry.company],
      ["Programme", inquiry.program], ["Reply due", `${deadline} (Manila time)`]]} />
    <EmailParagraph>Reply to the lead, then record the first reply in the portal.</EmailParagraph>
    <EmailButton internal href={`${config.CORPORATE_PORTAL_URL ?? "http://localhost:3000"}/inquiries/${inquiry.id}`}>Review overdue inquiry</EmailButton>
  </EmailLayout>;
}
