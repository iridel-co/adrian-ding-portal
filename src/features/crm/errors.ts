export enum CrmErrorCode {
  Unavailable = "crm_unavailable"
}

export enum EmailDeliveryErrorCode {
  ProviderRequestFailed = "provider_request_failed",
  ProviderRejected = "provider_rejected",
  ProviderThrottled = "provider_throttled",
  ProviderResponseInvalid = "provider_response_invalid",
  ProviderConflict = "provider_conflict",
  IdempotencyWindowExpired = "idempotency_window_expired",
  InquiryReminderObsolete = "inquiry_reminder_obsolete",
  PaymentInstructionsObsolete = "payment_instructions_obsolete",
  PaymentAcknowledgmentObsolete = "payment_acknowledgment_obsolete"
}

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
  RegistrationNotFound = "registration_not_found",
  RegistrationSessionNotFound = "registration_session_not_found",
  RegistrationStatusChanged = "registration_status_changed",
  RegistrationCancelled = "registration_cancelled",
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
