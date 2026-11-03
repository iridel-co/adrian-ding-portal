import { Badge } from "@/components/ui/badge";

export function RegistrationStatus({ isPaid, cancelledAt }: { isPaid: boolean; cancelledAt: Date | string | null }) {
  return <Badge variant={cancelledAt ? "destructive" : isPaid ? "success" : "warning"}>
    {cancelledAt ? "Cancelled" : isPaid ? "Paid" : "Unpaid"}
  </Badge>;
}
