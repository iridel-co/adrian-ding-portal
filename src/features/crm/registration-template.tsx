import { Img, render } from "react-email";
import { EmailAmount, EmailButton, EmailDetails, EmailLayout, EmailParagraph } from "./email-layout";
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

export async function registrationPaymentMessage(
  config: RegistrationMailConfig,
  registrant: { fullName: string; email: string; reference: string; priceCentavos: number },
  course: { title: string; primerVideoUrl: string | null; primerBlurb: string },
  session: { date: string; endDate: string; startTime: string; endTime: string; venueName: string; city: string },
  account: { providerName: string; accountName: string; accountNumber: string },
  qrUrl: string, attachment: NonNullable<CrmEmailPayload["attachments"]>[number]
): Promise<CrmEmailPayload> {
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
    text, html: await render(<RegistrationPaymentEmail registrant={registrant} course={course} session={session} account={account} qrUrl={qrUrl} />), attachments: [attachment] };
}

export async function registrationAcknowledgmentMessage(
  config: RegistrationMailConfig,
  registrant: { fullName: string; email: string; reference: string; paidAmountCentavos: number },
  course: { title: string },
  session: { date: string; endDate: string; startTime: string; endTime: string; venueName: string; city: string }
): Promise<CrmEmailPayload> {
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
    text, html: await render(<RegistrationAcknowledgmentEmail registrant={registrant} course={course} session={session} />) };
}

export function RegistrationPaymentEmail({ registrant, course, session, account, qrUrl }: {
  registrant: Parameters<typeof registrationPaymentMessage>[1]; course: Parameters<typeof registrationPaymentMessage>[2]; session: Parameters<typeof registrationPaymentMessage>[3]; account: Parameters<typeof registrationPaymentMessage>[4]; qrUrl: Parameters<typeof registrationPaymentMessage>[5];
}) {
  return <EmailLayout preview={`Payment information for ${course.title}`} label="WORKSHOP REGISTRATION" title="Your seat is reserved.">
      <EmailParagraph>Hello {registrant.fullName},</EmailParagraph>
      <EmailParagraph>Your workshop registration is saved and your seat is reserved. Payment is currently Unpaid.</EmailParagraph>
      <EmailDetails rows={[["Reference", registrant.reference], ["Workshop", course.title],
        ["Dates", `${session.date} to ${session.endDate}`], ["Time", `${session.startTime.slice(0, 5)} to ${session.endTime.slice(0, 5)} (Asia/Manila)`],
        ["Venue", `${session.venueName}, ${session.city}`]]} />
      <EmailAmount label="Amount to pay" amount={formatPesos(registrant.priceCentavos)} />
      <EmailDetails rows={[["Pay to", account.providerName], ["Account name", account.accountName],
        ["Account number", account.accountNumber], ["Payment reference", registrant.reference]]} />
      <Img src={qrUrl} alt="Payment QR code" width="180" style={{ display: "block", margin: "0 auto 18px", maxWidth: "100%", height: "auto" }} />
      <EmailParagraph>The payment QR is also attached. Reply to this email with your registration reference and a photo or screenshot of your payment proof.</EmailParagraph>
      <EmailParagraph>Our staff will check the payment and send an acknowledgment once it is marked Paid.</EmailParagraph>
      <EmailButton href={course.primerVideoUrl!}>Watch the workshop primer</EmailButton>
      <EmailParagraph>{course.primerBlurb}</EmailParagraph>
    </EmailLayout>;
}

export function RegistrationAcknowledgmentEmail({ registrant, course, session }: {
  registrant: Parameters<typeof registrationAcknowledgmentMessage>[1]; course: Parameters<typeof registrationAcknowledgmentMessage>[2]; session: Parameters<typeof registrationAcknowledgmentMessage>[3];
}) {
  return <EmailLayout preview={`Payment acknowledged for ${course.title}`} label="PAYMENT ACKNOWLEDGMENT" title="Your seat is confirmed.">
      <EmailParagraph>Hello {registrant.fullName},</EmailParagraph>
      <EmailParagraph>Our staff have verified your payment. Your workshop registration is now Paid and your seat is confirmed.</EmailParagraph>
      <EmailAmount label="Amount verified" amount={formatPesos(registrant.paidAmountCentavos)} />
      <EmailDetails rows={[["Reference", registrant.reference], ["Workshop", course.title],
        ["Dates", `${session.date} to ${session.endDate}`], ["Time", `${session.startTime.slice(0, 5)} to ${session.endTime.slice(0, 5)} (Asia/Manila)`],
        ["Venue", `${session.venueName}, ${session.city}`]]} />
      <EmailParagraph>For questions, reply to this email and include your registration reference.</EmailParagraph>
    </EmailLayout>;
}
