import { ReadState } from "@/components/table/read-state";
import { inquiryErrorMessage, isCrmAccessError } from "@/features/crm/presentation";

export function CrmReadState({ pending, error, retry, loadingMessage = "Loading inquiries…",
  accessTitle = "Inquiry access unavailable", errorMessage = inquiryErrorMessage }: {
  pending: boolean; error: unknown; retry: () => void;
  loadingMessage?: string; accessTitle?: string; errorMessage?: (error: unknown) => string;
}) {
  return <ReadState pending={pending} error={error} retry={retry} loadingMessage={loadingMessage}
    errorTitle={isCrmAccessError(error) ? accessTitle : undefined} errorMessage={errorMessage} />;
}
