import { Button } from "@/components/ui/button";
import { inquiryErrorMessage, isInquiryAccessError } from "@/features/crm/presentation";

export function CrmReadState({ pending, error, retry, loadingMessage = "Loading inquiries…",
  accessTitle = "Inquiry access unavailable", errorMessage = inquiryErrorMessage }: {
  pending: boolean; error: unknown; retry: () => void;
  loadingMessage?: string; accessTitle?: string; errorMessage?: (error: unknown) => string;
}) {
  if (pending) return <p role="status" className="py-8 text-muted-foreground">{loadingMessage}</p>;
  if (!error) return null;
  return <div role="alert" className="space-y-3 py-8">
    <h2 className="text-xl font-medium">{isInquiryAccessError(error) ? accessTitle : "Unable to load"}</h2>
    <p>{errorMessage(error)}</p>
    <Button variant="outline" onClick={retry}>Try again</Button>
  </div>;
}
