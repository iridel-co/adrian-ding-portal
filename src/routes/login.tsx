import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/config";
import { authClient } from "@/lib/auth-client";
import { getAuthUserQueryOptions } from "@/lib/auth.queries";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(getAuthUserQueryOptions());
    if (user) throw redirect({ to: "/" });
  },
  component: LoginPage
});

function LoginPage() {
  const { error } = Route.useSearch();
  const [isPending, setIsPending] = useState(false);

  const signIn = async () => {
    setIsPending(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login"
    });
    if (error) setIsPending(false);
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-3xl font-normal">{APP_NAME}</CardTitle>
          <CardDescription>Sign in with your Google account to continue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="text-sm text-destructive">
              Couldn't sign you in. Your email may not have access yet — ask an admin to add it.
            </p>
          )}
          <Button className="w-full" disabled={isPending} onClick={signIn}>
            <GoogleIcon />
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      />
    </svg>
  );
}
