import { Button } from "@/components/ui/button";

type ReadStateProps = {
  pending: boolean;
  error: unknown;
  retry: () => void;
  loadingMessage: string;
  errorTitle?: string;
  errorMessage: (error: unknown) => string;
};

/* The loading or error state of a query. Renders nothing once the data is ready. */
export function ReadState({
  pending,
  error,
  retry,
  loadingMessage,
  errorTitle = "Unable to load",
  errorMessage
}: ReadStateProps) {
  if (pending) {
    return (
      <p role="status" className="py-8 text-muted-foreground">
        {loadingMessage}
      </p>
    );
  }
  if (!error) return null;

  return (
    <div role="alert" className="space-y-3 py-8">
      <h2 className="text-xl font-medium">{errorTitle}</h2>
      <p>{errorMessage(error)}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
