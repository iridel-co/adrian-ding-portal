import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_app/settings/access")({
  head: () => ({ meta: [{ title: "Access" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allowedEmailsQueryOptions()),
  component: SettingsPage
});

function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage who can access this dashboard.</p>
      </div>
      <AllowedUsersCard />
    </div>
  );
}

function AllowedUsersCard() {
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(allowedEmailsQueryOptions());
  const [email, setEmail] = useState("");

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Only these Google accounts can sign in.</CardDescription>
      </CardHeader>
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

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.adminEmails.map((adminEmail) => (
              <TableRow key={`admin-${adminEmail}`}>
                <TableCell>{adminEmail}</TableCell>
                <TableCell className="text-muted-foreground">Admin (env)</TableCell>
                <TableCell />
              </TableRow>
            ))}
            {data.emails.map((row) => (
              <TableRow key={row.email}>
                <TableCell>{row.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {row.email !== user.email.toLowerCase() && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.email}`}
                      disabled={removeEmail.isPending}
                      onClick={() => removeEmail.mutate(row.email)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {data.adminEmails.length === 0 && data.emails.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
