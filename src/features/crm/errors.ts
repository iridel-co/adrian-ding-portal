export enum IntakeErrorCode {
  BodyTooLarge = "body_too_large",
  ConsentRequired = "consent_required",
  EmailJobNotFound = "email_job_not_found",
  EmailNotRetryable = "email_not_retryable",
  EmailUnavailable = "email_unavailable",
  HeadersNotAllowed = "headers_not_allowed",
  IdempotencyKeyMismatch = "idempotency_key_mismatch",
  InquiryNotFound = "inquiry_not_found",
  InquiryStatusChanged = "inquiry_status_changed",
  IntakeUnavailable = "intake_unavailable",
  InvalidIdempotencyKey = "invalid_idempotency_key",
  InvalidInquiryTransition = "invalid_inquiry_transition",
  InvalidJson = "invalid_json",
  InvalidSubmission = "invalid_submission",
  MethodNotAllowed = "method_not_allowed",
  OriginNotAllowed = "origin_not_allowed",
  RequestTimeout = "request_timeout",
  SchedulerDisabled = "scheduler_disabled",
  SchedulerUnauthorized = "scheduler_unauthorized",
  SchedulerUnavailable = "scheduler_unavailable",
  SessionUnavailable = "session_unavailable",
  SoldOut = "sold_out",
  SubmissionRejected = "submission_rejected",
  UnsupportedContentType = "unsupported_content_type",
  VerificationFailed = "verification_failed",
  VerificationUnavailable = "verification_unavailable",
}

export class IntakeError extends Error {
  constructor(public status: number, public code: IntakeErrorCode) { super(code); }
}
