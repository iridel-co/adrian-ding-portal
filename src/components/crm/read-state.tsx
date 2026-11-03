import type { ReactNode } from "react";
import { ReadState } from "@/components/table/read-state";
import { inquiryErrorMessage, isCrmAccessError } from "@/features/crm/presentation";

export function CrmReadState({ pending, error, retry, loadingMessage = "Loading inquiries…",
  accessTitle = "Inquiry access unavailable", errorMessage = inquiryErrorMessage, skeleton }: {
  pending: boolean; error: unknown; retry: () => void;
  loadingMessage?: string; accessTitle?: string; errorMessage?: (error: unknown) => string; skeleton?: ReactNode;
}) {
  return <ReadState pending={pending} error={error} retry={retry} loadingMessage={loadingMessage} skeleton={skeleton}
    errorTitle={isCrmAccessError(error) ? accessTitle : undefined} errorMessage={errorMessage} />;
}
