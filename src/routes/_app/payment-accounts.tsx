import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Field } from "@/components/cms/form-section";
import { MediaPicker, type PickedMedia } from "@/components/cms/media-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  $activatePaymentAccount,
  $archivePaymentAccount,
  $createPaymentAccount,
  $restorePaymentAccount,
  $updatePaymentAccount,
  paymentAccountsQueryOptions,
  type PaymentAccount
} from "@/features/crm/payment-accounts-functions";
import { $crmAccess } from "@/features/crm/functions";
import type { PaymentMethod } from "@/features/crm/payment-accounts-schemas";
import { crmAccessQueryOptions } from "@/features/crm/queries";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/payment-accounts")({
  beforeLoad: () => $crmAccess(),
  head: () => ({ meta: [{ title: "Payment accounts" }] }),
  component: PaymentAccountsPage
});

const METHOD_LABELS: Record<PaymentMethod, string> = { bank: "Bank", gcash: "GCash", maya: "Maya" };

function maskAccountNumber(value: string) {
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function PaymentAccountsPage() {
  const access = useQuery(crmAccessQueryOptions());
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const accounts = useQuery(paymentAccountsQueryOptions({ includeArchived }));
  const isAdmin = access.data?.role === "admin";
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });

  const action = (mutation: { mutate: (id: string) => void; isPending: boolean }, id: string) => {
    if (!isAdmin || mutation.isPending) return;
    mutation.mutate(id);
  };
  const activate = useMutation({
    mutationFn: (id: string) => $activatePaymentAccount({ data: { id } }),
    onSuccess: async () => { toast.success("Payment account is now used for new registrations."); await refresh(); },
    onError: (error) => toast.error(errorMessage(error))
  });
  const archive = useMutation({
    mutationFn: (id: string) => $archivePaymentAccount({ data: { id } }),
    onSuccess: async () => { toast.success("Payment account archived."); await refresh(); },
    onError: (error) => toast.error(errorMessage(error))
  });
  const restore = useMutation({
    mutationFn: (id: string) => $restorePaymentAccount({ data: { id } }),
    onSuccess: async () => { toast.success("Payment account restored."); await refresh(); },
    onError: (error) => toast.error(errorMessage(error))
  });

  return <div className="mx-auto flex max-w-6xl flex-col gap-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-4xl">Payment accounts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The account details and QR code sent in new workshop payment instructions.
        </p>
      </div>
      {isAdmin && <Button onClick={() => setEditing(null)}><Plus /> Add account</Button>}
    </div>

    <div className="flex items-center gap-2">
      <Checkbox id="payment-account-archived" checked={includeArchived} onCheckedChange={(checked) => setIncludeArchived(checked === true)} />
      <Label htmlFor="payment-account-archived">Show archived accounts</Label>
    </div>

    {accounts.isError ? <p role="alert" className="rounded-md border border-destructive/40 py-12 text-center text-sm text-destructive">{errorMessage(accounts.error)}</p> : accounts.isPending ? <p className="py-12 text-center text-sm text-muted-foreground">Loading payment accounts…</p> : accounts.data?.length === 0 ? <p className="rounded-md border py-12 text-center text-sm text-muted-foreground">No payment accounts yet.</p> :
      <Table><TableHeader><TableRow>
        <TableHead>Channel</TableHead><TableHead>Pay to</TableHead><TableHead>Account</TableHead><TableHead>Payment QR</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
      </TableRow></TableHeader><TableBody>
        {accounts.data?.map((account) => <TableRow key={account.id} className={account.archivedAt ? "opacity-60" : undefined}>
          <TableCell><div className="font-medium">{METHOD_LABELS[account.method]}</div><div className="text-xs text-muted-foreground">{account.providerName}</div></TableCell>
          <TableCell>{account.providerName}</TableCell>
          <TableCell><div>{account.accountName}</div><div className="font-mono text-xs text-muted-foreground">{maskAccountNumber(account.accountNumber)}</div></TableCell>
          <TableCell>{account.qrUrl ? <img src={account.qrUrl} alt={account.qrAlt || "Payment QR"} className="size-14 rounded border object-contain" /> : <span className="text-sm text-destructive">Missing</span>}</TableCell>
          <TableCell>{account.archivedAt ? <Badge variant="outline">Archived</Badge> : account.selectedForNewRegistrations ? <Badge><ShieldCheck /> Used for new registrations</Badge> : <Badge variant="secondary">Available</Badge>}</TableCell>
          <TableCell><div className="flex justify-end gap-1">
            {isAdmin && !account.archivedAt && <>
              <Button variant="ghost" size="icon" title="Edit account" aria-label={`Edit ${account.providerName}`} onClick={() => setEditing(account)}><Pencil /></Button>
              {!account.selectedForNewRegistrations && <Button variant="outline" size="sm" disabled={activate.isPending} onClick={() => { if (window.confirm(`Use ${account.providerName} for new workshop registrations?`)) action(activate, account.id); }}>Use for new registrations</Button>}
              {!account.isActive && !account.selectedForNewRegistrations && <Button variant="ghost" size="icon" title="Archive account" aria-label={`Archive ${account.providerName}`} onClick={() => { if (window.confirm(`Archive ${account.providerName}?`)) action(archive, account.id); }}><Trash2 /></Button>}
            </>}
            {isAdmin && account.archivedAt && <Button variant="ghost" size="icon" title="Restore account" aria-label={`Restore ${account.providerName}`} onClick={() => action(restore, account.id)}><RotateCcw /></Button>}
          </div></TableCell>
        </TableRow>)}
      </TableBody></Table>}

    {editing !== undefined && <PaymentAccountDialog account={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
  </div>;
}

type AccountForm = { method: PaymentMethod; providerName: string; accountName: string; accountNumber: string; qrMediaId: string };

function PaymentAccountDialog({ account, onClose, onSaved }: { account: PaymentAccount | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [values, setValues] = useState<AccountForm>({ method: "bank", providerName: "", accountName: "", accountNumber: "", qrMediaId: "" });
  const [qr, setQr] = useState<PickedMedia | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!account) return;
    setValues({ method: account.method, providerName: account.providerName, accountName: account.accountName, accountNumber: account.accountNumber, qrMediaId: account.qrMediaId ?? "" });
    setQr(account.qrMediaId && account.qrUrl ? { id: account.qrMediaId, url: account.qrUrl, alt: account.qrAlt ?? "" } : null);
  }, [account]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (account) await $updatePaymentAccount({ data: { id: account.id, ...values } });
      else await $createPaymentAccount({ data: values });
      toast.success(account ? "Payment account updated." : "Payment account added.");
      await onSaved();
      onClose();
    } catch (error) { toast.error(errorMessage(error)); } finally { setSaving(false); }
  };
  const setField = (field: keyof AccountForm, value: string) => setValues((current) => ({ ...current, [field]: value }));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-xl"><form onSubmit={save}>
      <DialogHeader><DialogTitle>{account ? "Edit payment account" : "Add payment account"}</DialogTitle><DialogDescription>These details are sent to registrants in payment instructions.</DialogDescription></DialogHeader>
      <div className="mt-6 flex flex-col gap-4">
        <Field label="Payment channel" htmlFor="payment-method"><Select value={values.method} onValueChange={(value) => setField("method", value)}><SelectTrigger id="payment-method" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => <SelectItem key={method} value={method}>{METHOD_LABELS[method]}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Pay to" htmlFor="payment-provider"><Input id="payment-provider" value={values.providerName} onChange={(event) => setField("providerName", event.target.value)} placeholder="e.g. BPI or GCash" /></Field>
        <Field label="Account name" htmlFor="payment-account-name"><Input id="payment-account-name" value={values.accountName} onChange={(event) => setField("accountName", event.target.value)} /></Field>
        <Field label="Account number" htmlFor="payment-account-number"><Input id="payment-account-number" value={values.accountNumber} onChange={(event) => setField("accountNumber", event.target.value)} /></Field>
        <Field label="Payment QR" hint="Use an active PNG, JPEG, or WebP image up to 1 MiB.">
          {qr ? <div className="flex items-center gap-3 rounded-md border p-3"><img src={qr.url} alt={qr.alt} className="size-20 rounded border object-contain" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{qr.alt || "Payment QR"}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setPickerOpen(true)}>Change image</Button></div></div> : <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>Choose QR image</Button>}
        </Field>
      </div>
      <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !values.qrMediaId}>{saving ? "Saving…" : "Save account"}</Button></DialogFooter>
    </form></DialogContent>
    <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(picked) => { setQr(picked); setField("qrMediaId", picked.id); }} />
  </Dialog>;
}
