import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore, CircleCheck, Pencil, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Field } from "@/components/cms/form-section";
import { ContentListPage, EmptyState } from "@/components/cms/content-list-page";
import { MediaPicker, type PickedMedia } from "@/components/cms/media-picker";
import { StatusBadge, type StatusDisplay } from "@/components/cms/status-badge";
import { CrmReadState } from "@/components/crm/read-state";
import { SortableTableHead } from "@/components/table/sortable-table-head";
import { TablePagination } from "@/components/table/table-pagination";
import { ActionsHead, RowAction, RowActions } from "@/components/table/row-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
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
import { paymentAccountSearchSchema, type PaymentMethod } from "@/features/crm/payment-accounts-schemas";
import { crmAccessQueryOptions } from "@/features/crm/queries";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/payment-accounts")({
  validateSearch: paymentAccountSearchSchema,
  beforeLoad: () => $crmAccess(),
  head: () => ({ meta: [{ title: "Payment accounts" }] }),
  component: PaymentAccountsPage
});

const METHOD_LABELS: Record<PaymentMethod, string> = { bank: "Bank", gcash: "GCash", maya: "Maya" };

type PaymentAccountStatus = "active" | "available" | "archived";

const PAYMENT_ACCOUNT_STATUS_DISPLAY = {
  active: { label: "Active", variant: "success" },
  available: { label: "Available", variant: "info" },
  archived: { label: "Archived", variant: "neutral" }
} as const satisfies Record<PaymentAccountStatus, StatusDisplay>;

function maskAccountNumber(value: string) {
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function paymentAccountStatus(account: PaymentAccount): StatusDisplay {
  return account.archivedAt
    ? PAYMENT_ACCOUNT_STATUS_DISPLAY.archived
    : account.selectedForNewRegistrations
      ? PAYMENT_ACCOUNT_STATUS_DISPLAY.active
      : PAYMENT_ACCOUNT_STATUS_DISPLAY.available;
}

type ConfirmedAccountAction = {
  kind: "activate" | "archive";
  account: PaymentAccount;
};

function PaymentAccountsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const access = useQuery(crmAccessQueryOptions());
  const [editing, setEditing] = useState<PaymentAccount | null | undefined>(undefined);
  const [confirming, setConfirming] = useState<ConfirmedAccountAction | null>(null);
  const queryClient = useQueryClient();
  const accounts = useQuery(paymentAccountsQueryOptions(search));
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

  return <ContentListPage
    title="Payment accounts"
    description="The account details and QR code sent in new workshop payment instructions."
    action={<div className="flex gap-2">
      <Button variant="outline" onClick={() => void accounts.refetch()} disabled={accounts.isFetching}>Refresh</Button>
      {isAdmin && <Button onClick={() => setEditing(null)}><Plus /> Add account</Button>}
    </div>}
    filters={<div className="flex items-center gap-2">
      <Checkbox id="payment-account-archived" checked={search.includeArchived} onCheckedChange={(checked) => void navigate({ search: { ...search, includeArchived: checked === true, offset: 0 } })} />
      <Label htmlFor="payment-account-archived">Show archived accounts</Label>
    </div>}
  >
    <CrmReadState pending={accounts.isPending} error={accounts.error} retry={() => void accounts.refetch()}
      loadingMessage="Loading payment accounts…" accessTitle="Payment-account access unavailable" errorMessage={errorMessage} />
    {!accounts.isError && accounts.data && (accounts.data.items.length === 0 ? <EmptyState>No payment accounts yet.</EmptyState> : <>
      <Table>
      <TableHeader><TableRow>{([['method', 'Channel'], ['providerName', 'Pay to'], ['accountName', 'Account']] as const).map(([key, label]) =>
        <SortableTableHead key={key} active={search.sort === key} direction={search.direction}
          onClick={() => void navigate({ search: { ...search, sort: key, direction: search.sort === key && search.direction === "asc" ? "desc" : "asc", offset: 0 } })}>{label}</SortableTableHead>
      )}<TableHead>Payment QR</TableHead><SortableTableHead active={search.sort === "isActive"} direction={search.direction}
        onClick={() => void navigate({ search: { ...search, sort: "isActive", direction: search.sort === "isActive" && search.direction === "asc" ? "desc" : "asc", offset: 0 } })}>Status</SortableTableHead><ActionsHead />
      </TableRow></TableHeader><TableBody>
        {accounts.data.items.map((account) => <TableRow key={account.id} className={account.archivedAt ? "opacity-60" : undefined}>
          <TableCell className="py-5"><div className="font-medium">{METHOD_LABELS[account.method]}</div><div className="text-xs text-muted-foreground">{account.providerName}</div></TableCell>
          <TableCell className="py-5">{account.providerName}</TableCell>
          <TableCell className="py-5"><div>{account.accountName}</div><div className="font-mono text-xs text-muted-foreground">{maskAccountNumber(account.accountNumber)}</div></TableCell>
          <TableCell className="py-5">{account.qrUrl ? <img src={account.qrUrl} alt={account.qrAlt || "Payment QR"} className="size-14 rounded border object-contain" /> : <span className="text-sm text-destructive">Missing</span>}</TableCell>
          <TableCell className="py-5"><StatusBadge display={paymentAccountStatus(account)} /></TableCell>
          <RowActions>
            {isAdmin && !account.archivedAt && <>
              <RowAction icon={Pencil} label="Edit account" onClick={() => setEditing(account)} />
              {!account.selectedForNewRegistrations && <RowAction icon={CircleCheck} label="Set as active" disabled={activate.isPending || !account.qrMediaId} onClick={() => setConfirming({ kind: "activate", account })} />}
              {!account.isActive && !account.selectedForNewRegistrations && <RowAction icon={Archive} label="Archive account" tone="destructive" onClick={() => setConfirming({ kind: "archive", account })} />}
            </>}
            {isAdmin && account.archivedAt && <RowAction icon={ArchiveRestore} label="Restore account" onClick={() => action(restore, account.id)} />}
          </RowActions>
        </TableRow>)}
      </TableBody></Table>
      <TablePagination limit={search.limit} offset={search.offset} count={accounts.data.items.length}
        hasMore={accounts.data.hasMore} fetching={accounts.isFetching}
        onChange={(page) => void navigate({ search: { ...search, ...page } })} />
    </>)}

    {editing !== undefined && <PaymentAccountDialog account={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
    <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirming?.kind === "archive" ? "Archive this payment account?" : "Use this payment account for new registrations?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirming?.kind === "archive"
              ? `${confirming.account.providerName} will be hidden from the active list. You can restore it later.`
              : `${confirming?.account.providerName ?? "This account"} will replace the current payment account in new workshop instructions.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{confirming?.kind === "archive" ? "Keep account" : "Keep current account"}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirming?.kind === "archive" ? "destructive" : "default"}
            disabled={archive.isPending || activate.isPending}
            onClick={() => {
              if (!confirming) return;
              action(confirming.kind === "archive" ? archive : activate, confirming.account.id);
              setConfirming(null);
            }}
          >
            {confirming?.kind === "archive" ? "Archive account" : "Use account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </ContentListPage>;
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
