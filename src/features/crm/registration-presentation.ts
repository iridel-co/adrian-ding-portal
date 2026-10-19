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
  crm_unavailable: "Unable to load workshop registrations. Try again."
};

export function registrationErrorMessage(error: unknown) {
  return error instanceof Error && messages[error.message] ? messages[error.message] : "The request could not be completed. Try again.";
}
