export function emailStateLabel(state: "pending" | "sending" | "sent" | "failed" | "skipped" | "needs_reconciliation" | undefined) {
  if (!state) return "No email job";
  return { pending: "Pending", sending: "Sending", sent: "Accepted by email provider", failed: "Failed", skipped: "Skipped", needs_reconciliation: "Needs review before resend" }[state];
}
