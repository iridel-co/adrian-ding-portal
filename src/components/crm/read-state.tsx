import { Button } from "@/components/ui/button";

export function CrmReadState({ pending, failed, retry }: { pending: boolean; failed: boolean; retry: () => void }) {
  if (pending) return <p role="status" className="py-8 text-sm text-muted-foreground">Loading…</p>;
  if (failed) return <div role="alert" className="flex flex-col items-start gap-3 py-8">
    <p>Unable to load this information. Check your connection and staff access, then try again.</p>
    <Button variant="outline" onClick={retry}>Try again</Button>
  </div>;
  return null;
}

export function CrmAccessDenied() {
  return <div className="py-8"><h1 className="font-display text-3xl">Access denied</h1>
    <p className="mt-2 text-sm text-muted-foreground">Your account does not have access to registrations. Contact your portal administrator.</p></div>;
}
