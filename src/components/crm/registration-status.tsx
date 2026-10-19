import { Badge } from "@/components/ui/badge";

export function RegistrationStatus({ isPaid, cancelledAt }: { isPaid: boolean; cancelledAt: Date | string | null }) {
  return <Badge variant={cancelledAt ? "destructive" : isPaid ? "secondary" : "default"}
    className={!cancelledAt && isPaid ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : undefined}>
    {cancelledAt ? "Cancelled" : isPaid ? "Paid" : "Unpaid"}
  </Badge>;
}
