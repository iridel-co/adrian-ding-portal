import { CrmEmailKind } from "@/db/schema/crm-email-kind";
import { CrmEmailState } from "@/db/schema/crm-email-state";
import type { paymentMethod } from "@/db/schema/payments";
import type { RegistrationAction } from "./registration-staff-schemas";
import { canRetryEmail } from "./presentation";
import { AccessErrorCode } from "@/lib/access-errors";
import { commonErrorMessages, fallbackErrorMessage } from "./error-presentation";
import { CrmErrorCode, IntakeErrorCode } from "./errors";

const messages: Record<string, string> = {
  ...commonErrorMessages,
  [AccessErrorCode.StaffAccessRequired]: "Your account does not have registration access. Contact your portal administrator.",
  [AccessErrorCode.AccessUnavailable]: "Unable to check registration access. Try again.",
  [IntakeErrorCode.RegistrationSessionNotFound]: "This scheduled workshop could not be found. Return to the scheduled workshops.",
  [IntakeErrorCode.RegistrationNotFound]: "This registration could not be found.",
  [IntakeErrorCode.RegistrationStatusChanged]: "This registration changed. Your input has been kept. Close the dialog, review the latest record and reopen the action.",
  [IntakeErrorCode.RegistrationCancelled]: "This registration has been cancelled. No further changes are available.",
  [IntakeErrorCode.EmailUnavailable]: "Payment could not be recorded because acknowledgment email settings are unavailable. Your input has been kept. Contact your administrator, then try again.",
  [IntakeErrorCode.EmailNotRetryable]: "This email cannot be retried right now. Refresh and review its delivery and payment state.",
  [IntakeErrorCode.EmailJobNotFound]: "This email could not be found for the registration.",
  [CrmErrorCode.Unavailable]: "Unable to load workshop registrations. Try again."
};

export function registrationErrorMessage(error: unknown) {
  return error instanceof Error && messages[error.message] ? messages[error.message] : fallbackErrorMessage;
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
  return !registration.cancelledAt && canRetryEmail(job, now)
    && (job.kind === CrmEmailKind.PaymentInstructions && !registration.isPaid
      || job.kind === CrmEmailKind.PaymentAcknowledgment && registration.isPaid);
}

export type RegistrationDraft = {
  action: RegistrationAction | null; open: boolean; expectedIsPaid: boolean; expectedUpdatedAt: string;
  paymentMethod: typeof paymentMethod.enumValues[number] | ""; amount: number | null;
  payerName: string; transactionReference: string; reason: string; validation: string; needsReview: boolean;
};
export const emptyRegistrationDraft: RegistrationDraft = {
  action: null, open: false, expectedIsPaid: false, expectedUpdatedAt: "", paymentMethod: "", amount: null,
  payerName: "", transactionReference: "", reason: "", validation: "", needsReview: false
};
export const paymentMethodLabels: Record<typeof paymentMethod.enumValues[number], string> = { bank: "Bank transfer", gcash: "GCash", maya: "Maya" };
