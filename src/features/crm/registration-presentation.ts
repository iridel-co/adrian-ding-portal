const messages: Record<string, string> = {
  Unauthorized: "Your session has ended. Sign in again.",
  staff_access_required: "Your account does not have registration access. Contact your portal administrator.",
  access_unavailable: "Unable to check registration access. Try again.",
  origin_not_allowed: "This request was blocked. Open the portal at its configured address and try again.",
  crm_unavailable: "Unable to load workshop registrations. Try again."
};

export function registrationErrorMessage(error: unknown) {
  return error instanceof Error && messages[error.message] ? messages[error.message] : "The request could not be completed. Try again.";
}
