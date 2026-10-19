import { CrmEmailKind } from "@/db/schema/crm-email-kind";
import { CrmEmailState } from "@/db/schema/crm-email-state";
import { canRetryInquiryEmail } from "./presentation";
import { IntakeErrorCode } from "./errors";

const messages: Record<string, string> = {
  Unauthorized: "Your session has ended. Sign in again.",
  staff_access_required: "Your account does not have registration access. Contact your portal administrator.",
  access_unavailable: "Unable to check registration access. Try again.",
  origin_not_allowed: "This request was blocked. Open the portal at its configured address and try again.",
  registration_session_not_found: "This workshop run could not be found. Return to the workshop run list.",
  [IntakeErrorCode.RegistrationNotFound]: "This registration could not be found.",
  [IntakeErrorCode.RegistrationStatusChanged]: "This registration changed. Your input has been kept. Close the dialog, review the latest record and reopen the action.",
  [IntakeErrorCode.RegistrationCancelled]: "This registration has been cancelled. No further changes are available.",
  [IntakeErrorCode.EmailUnavailable]: "Payment could not be recorded because acknowledgment email settings are unavailable. Your input has been kept. Contact your administrator, then try again.",
  [IntakeErrorCode.EmailNotRetryable]: "This email cannot be retried right now. Refresh and review its delivery and payment state.",
  [IntakeErrorCode.EmailJobNotFound]: "This email could not be found for the registration.",
  crm_unavailable: "Unable to load workshop registrations. Try again."
};

export function registrationErrorMessage(error: unknown) {
  return error instanceof Error && messages[error.message] ? messages[error.message] : "The request could not be completed. Try again.";
}

export function registrationEmailErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === IntakeErrorCode.EmailUnavailable) {
    return "Email sending is disabled or the saved message is not ready. Contact your administrator. Payment status has not changed.";
  }
  return registrationErrorMessage(error);
}

export const registrationEmailLabels = {
  [CrmEmailKind.PaymentInstructions]: "Payment information",
  [CrmEmailKind.PaymentAcknowledgment]: "Payment acknowledgment"
};

type RegistrationEmail = { kind: CrmEmailKind; state: CrmEmailState; leaseExpiresAt: Date | string | null };
type RegistrationPayment = { isPaid: boolean; cancelledAt: Date | string | null };
export function canRetryRegistrationEmail(job: RegistrationEmail, registration: RegistrationPayment, now = Date.now()) {
  return !registration.cancelledAt && canRetryInquiryEmail(job, now)
    && (job.kind === CrmEmailKind.PaymentInstructions && !registration.isPaid
      || job.kind === CrmEmailKind.PaymentAcknowledgment && registration.isPaid);
}
