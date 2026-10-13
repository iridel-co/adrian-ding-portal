import { Button } from "@/components/ui/button";
import { inquiryErrorMessage, isInquiryAccessError } from "@/features/crm/presentation";

export function CrmReadState({ pending, error, retry }: { pending: boolean; error: unknown; retry: () => void }) {
  if (pending) return <p role="status" className="py-8 text-muted-foreground">Loading inquiries…</p>;
  if (!error) return null;
  return <div role="alert" className="space-y-3 py-8">
    <h2 className="text-xl font-medium">{isInquiryAccessError(error) ? "Inquiry access unavailable" : "Unable to load"}</h2>
    <p>{inquiryErrorMessage(error)}</p>
    <Button variant="outline" onClick={retry}>Try again</Button>
  </div>;
}
