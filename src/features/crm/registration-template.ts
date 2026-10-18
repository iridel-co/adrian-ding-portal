import type { CrmEmailPayload } from "@/db/schema";
import { formatPesos } from "@/features/shared/money";

export type RegistrationMailConfig = {
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  REGISTRATION_PAYMENT_ACCOUNT_ID: string;
  REGISTRATION_EMAIL_ENABLED: boolean;
  RESEND_API_KEY: string;
};

export function registrationMessageHasPlaceholders(payload: CrmEmailPayload) {
  return /example\.|\.invalid|\[(?:PAYMENT|PRIMER)[^\]]*\]/i.test(
    [payload.from, ...payload.to, payload.replyTo ?? "", payload.text ?? "", payload.html].join(" "));
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]!);

export function registrationPaymentMessage(
  config: RegistrationMailConfig,
  registrant: { fullName: string; email: string; reference: string; priceCentavos: number },
  course: { title: string; primerVideoUrl: string | null; primerBlurb: string },
  session: { date: string; endDate: string; startTime: string; endTime: string; venueName: string; city: string },
  account: { providerName: string; accountName: string; accountNumber: string },
  qrUrl: string, attachment: NonNullable<CrmEmailPayload["attachments"]>[number]
): CrmEmailPayload {
  const text = `Hello ${registrant.fullName},

Your workshop registration is saved and your seat is reserved. Payment is currently Unpaid.
Reference: ${registrant.reference}
Workshop: ${course.title}
Dates: ${session.date} to ${session.endDate}
Time: ${session.startTime.slice(0, 5)} to ${session.endTime.slice(0, 5)} (Asia/Manila)
Venue: ${session.venueName}, ${session.city}
Amount to pay: ${formatPesos(registrant.priceCentavos)}

Pay to ${account.providerName}
Account name: ${account.accountName}
Account number: ${account.accountNumber}
Payment reference: ${registrant.reference}
Payment QR: ${qrUrl}
The payment QR is also attached.

Reply to this email with your registration reference and a photo or screenshot of your payment proof.
Our staff will check the payment and send an acknowledgment once it is marked Paid.

Workshop primer: ${course.primerVideoUrl}
${course.primerBlurb}`;
  return { from: config.EMAIL_FROM, to: [registrant.email], replyTo: config.EMAIL_REPLY_TO,
    subject: `[${registrant.reference}] Payment information for ${course.title.replace(/[\r\n]/g, " ")}`,
    text, html: `<div style="white-space:pre-wrap">${escape(text)}</div>
<p><a href="${escape(course.primerVideoUrl!)}">Watch the workshop primer</a></p>
<p><img src="${escape(qrUrl)}" alt="Payment QR code"></p>`, attachments: [attachment] };
}

export function registrationAcknowledgmentMessage(
  config: RegistrationMailConfig,
  registrant: { fullName: string; email: string; reference: string; paidAmountCentavos: number },
  course: { title: string },
  session: { date: string; endDate: string; startTime: string; endTime: string; venueName: string; city: string }
): CrmEmailPayload {
  const text = `Hello ${registrant.fullName},

Our staff have verified your payment. Your workshop registration is now Paid and your seat is confirmed.
Reference: ${registrant.reference}
Amount verified: ${formatPesos(registrant.paidAmountCentavos)}
Workshop: ${course.title}
Dates: ${session.date} to ${session.endDate}
Time: ${session.startTime.slice(0, 5)} to ${session.endTime.slice(0, 5)} (Asia/Manila)
Venue: ${session.venueName}, ${session.city}

For questions, reply to this email and include your registration reference.`;
  return { from: config.EMAIL_FROM, to: [registrant.email], replyTo: config.EMAIL_REPLY_TO,
    subject: `[${registrant.reference}] Payment acknowledged for ${course.title.replace(/[\r\n]/g, " ")}`,
    text, html: `<div style="white-space:pre-wrap">${escape(text)}</div>` };
}
