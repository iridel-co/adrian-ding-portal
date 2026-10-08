export class CrmActionError extends Error {
  constructor(public code: string) { super(actionErrorLabel(code)); }
}

export function actionErrorLabel(code: string) {
  const labels: Record<string, string> = {
    payment_status_changed: "Payment changed since you opened this record. Review the refreshed status before trying again.",
    registration_cancelled: "This registration has been cancelled. Review the refreshed record.",
    paid_registration_cannot_cancel: "Payment is now Paid. Review the refreshed record before cancelling.",
    authentication_required: "Your session has ended. Sign in again before saving.",
    staff_access_required: "You no longer have permission to manage registrations.",
    email_unavailable: "Email sending is unavailable. The registration is still saved.",
    reason_required: "Enter a reason before saving.",
    registration_not_found: "This registration is no longer available."
  };
  return labels[code] ?? "Unable to complete the request. Refresh the record and try again.";
}

export async function submitCrmAction(path: string, method: "POST" | "PATCH", input: unknown) {
  const response = await fetch(`/api/crm/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CrmActionError(body?.error?.code ?? "crm_unavailable");
  }
  return response.json();
}
