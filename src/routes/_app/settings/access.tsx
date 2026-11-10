import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/cms/content-list-page";
import { QuickAction } from "@/components/quick-action";
import { ActionsHead, countOf, RowAction, RowActions, runBulk, SelectAllHead, SelectCell, useRowSelection } from "@/components/table/row-actions";
import { SelectionBar } from "@/components/table/selection-bar";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  $addAllowedEmail,
  $removeAllowedEmail,
  allowedEmailsQueryOptions
} from "@/lib/allowed-emails.functions";
import { errorMessage } from "@/features/shared/error-message";
import { SettingsNav } from "@/components/settings-nav";

export const Route = createFileRoute("/_app/settings/access")({
  head: () => ({ meta: [{ title: "Access" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allowedEmailsQueryOptions()),
  pendingComponent: () => (
    <SettingsPage>
      <Card>
        <UsersCardHeader />
        <CardContent>
          <TableSkeleton columns={[{ label: "Email" }, { label: "Added" }, { label: "", className: "w-12" }]} />
        </CardContent>
      </Card>
    </SettingsPage>
  ),
  component: () => (
    <SettingsPage>
      <AllowedUsersCard />
    </SettingsPage>
  )
});

function SettingsPage({ children }: { children: ReactNode }) {
  const { crmAccess } = Route.useRouteContext();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <SettingsNav isAdmin={crmAccess?.role === "admin"} />
      <div>
        <h1 className="font-display text-4xl">Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage who can access this dashboard.</p>
      </div>
      {children}
    </div>
  );
}

function UsersCardHeader() {
  return (
    <CardHeader>
      <CardTitle><h2 className="text-xl font-semibold">Users</h2></CardTitle>
      <CardDescription>Only these Google accounts can sign in.</CardDescription>
    </CardHeader>
  );
}

function AllowedUsersCard() {
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(allowedEmailsQueryOptions());
  const [email, setEmail] = useState("");
  /* You can't remove yourself, and env admins aren't stored here, so only the other stored users can be ticked. */
  const removable = data.emails.filter((row) => row.email !== user.email.toLowerCase()).map((row) => ({ ...row, id: row.email }));
  const selection = useRowSelection(removable);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries(allowedEmailsQueryOptions());

  const addEmail = useMutation({
    mutationFn: (email: string) => $addAllowedEmail({ data: { email } }),
    onSuccess: async () => {
      setEmail("");
      toast.success("User added.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const removeEmail = useMutation({
    mutationFn: (email: string) => $removeAllowedEmail({ data: { email } }),
    onSuccess: async () => {
      toast.success("User removed.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const removeSelected = useMutation({
    mutationFn: (rows: { email: string }[]) => runBulk(rows, (row) => $removeAllowedEmail({ data: { email: row.email } }), {
      name: (row) => row.email,
      done: (count) => `Removed ${countOf(count, "user")}.`
    }),
    onSettled: async () => {
      selection.clear();
      await refresh();
    }
  });

  return (
    <Card>
      <UsersCardHeader />
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addEmail.mutate(email);
          }}
        >
          <Input
            type="email"
            required
            placeholder="name@example.com"
            aria-label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={addEmail.isPending}>
            Add user
          </Button>
        </form>

        {selection.selected.length > 0 && (
          <SelectionBar count={selection.selected.length} total={selection.total} onSelectAll={selection.selectAll} onClear={selection.clear}>
            <QuickAction icon={Trash2} tone="destructive" disabled={removeSelected.isPending} onClick={() => setIsConfirmOpen(true)}>Remove</QuickAction>
          </SelectionBar>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead selection={selection} label="Select all users you can remove" />
              <TableHead>Email</TableHead>
              <TableHead>Added</TableHead>
              <ActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.adminEmails.map((adminEmail) => (
              <TableRow key={`admin-${adminEmail}`}>
                <TableCell />
                <TableCell>{adminEmail}</TableCell>
                <TableCell className="text-muted-foreground">Admin (env)</TableCell>
                <TableCell />
              </TableRow>
            ))}
            {data.emails.map((row) => (
              <TableRow key={row.email} data-state={selection.isSelected(row.email) ? "selected" : undefined}>
                {row.email !== user.email.toLowerCase()
                  ? <SelectCell checked={selection.isSelected(row.email)} onChange={(checked) => selection.toggle(row.email, checked)} label={`Select ${row.email}`} />
                  : <TableCell />}
                <TableCell>{row.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString()}
                </TableCell>
                <RowActions>
                  {row.email !== user.email.toLowerCase() && (
                    <RowAction
                      icon={Trash2}
                      label="Remove user"
                      tone="destructive"
                      aria-label={`Remove ${row.email}`}
                      disabled={removeEmail.isPending}
                      onClick={() => removeEmail.mutate(row.email)}
                    />
                  )}
                </RowActions>
              </TableRow>
            ))}
            {data.adminEmails.length === 0 && data.emails.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState icon={Users} className="py-8 shadow-none ring-0">
                    No users yet.
                  </EmptyState>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {countOf(selection.selected.length, "user")}?</AlertDialogTitle>
              <AlertDialogDescription>They won't be able to sign in anymore. You can add them back later.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep them</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => removeSelected.mutate(selection.selected)}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
