import { CrmEmailState } from "@/db/schema/crm-email-state";
import { AccessErrorCode } from "@/lib/access-errors";
import { commonErrorMessages, fallbackErrorMessage } from "./error-presentation";
import { CrmErrorCode, IntakeErrorCode } from "./errors";
import type { InquiryStatus } from "./lifecycle";

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  NEW: "New", CONTACTED: "Contacted", PROPOSAL_SENT: "Proposal sent", WON: "Won", LOST: "Lost", SPAM: "Spam"
};
export const inquiryActionLabels: Partial<Record<InquiryStatus, string>> = {
  CONTACTED: "Record first reply", PROPOSAL_SENT: "Record sent proposal", WON: "Mark won", LOST: "Mark lost", SPAM: "Mark spam"
};
export const inquiryStatusOptions = [
  { value: "all" as const, label: "All" }, { value: "non-spam" as const, label: "Non-spam" },
  ...Object.entries(inquiryStatusLabels).map(([value, label]) => ({ value: value as InquiryStatus, label }))
];

export function isInquiryOverdue(inquiry: { status: InquiryStatus; slaDueAt: Date | string }, now = Date.now()) {
  return inquiry.status === "NEW" && new Date(inquiry.slaDueAt).getTime() < now;
}

export function canRetryInquiryEmail(job: { state: string; leaseExpiresAt: Date | string | null }, now = Date.now()) {
  return job.state === CrmEmailState.Pending || job.state === CrmEmailState.Failed
    || (job.state === CrmEmailState.Sending && (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= now));
}

export function formatInquiryTime(value: Date | string | null) {
  return value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

export const emailStateLabels: Record<string, string> = {
  [CrmEmailState.Pending]: "Awaiting attempt", [CrmEmailState.Sending]: "Sending", [CrmEmailState.Failed]: "Attempt failed", [CrmEmailState.Sent]: "Accepted by email provider",
  [CrmEmailState.Skipped]: "Skipped", [CrmEmailState.NeedsReconciliation]: "Needs manual reconciliation"
};

const messages: Record<string, string> = {
  ...commonErrorMessages,
  [AccessErrorCode.StaffAccessRequired]: "Your account does not have inquiry access. Contact your portal administrator.",
  [AccessErrorCode.AccessUnavailable]: "Unable to check inquiry access. Try again.",
  [CrmErrorCode.Unavailable]: "Unable to load or save this inquiry. Try again.",
  [IntakeErrorCode.InquiryNotFound]: "This inquiry could not be found.",
  [IntakeErrorCode.InquiryStatusChanged]: "Another staff member changed this inquiry. Review the latest status before trying again. Your input has been kept.",
  [IntakeErrorCode.InvalidInquiryTransition]: "This action is no longer available. Refresh and review the inquiry.",
  [IntakeErrorCode.EmailUnavailable]: "Email sending is disabled or the saved message contains placeholders. Contact your portal administrator.",
  [IntakeErrorCode.EmailNotRetryable]: "This email cannot be retried right now. Refresh to check its latest state.",
  [IntakeErrorCode.EmailJobNotFound]: "This email could not be found for the inquiry."
};
export function inquiryErrorMessage(error: unknown) {
  return error instanceof Error && messages[error.message] ? messages[error.message] : fallbackErrorMessage;
}
export function isInquiryAccessError(error: unknown) {
  return error instanceof Error && [AccessErrorCode.Unauthorized, AccessErrorCode.StaffAccessRequired].some(code => code === error.message);
}
