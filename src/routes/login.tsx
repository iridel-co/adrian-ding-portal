import { createFileRoute, redirect } from "@tanstack/react-router";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import logoUrl from "@/assets/ad-logo.svg";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { getAuthUserQueryOptions } from "@/lib/auth.queries";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(getAuthUserQueryOptions());
    if (user) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Sign in" }] }),
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
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <BrandPanel />

      <div className="flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border bg-card shadow-xs lg:hidden">
              <img src={logoUrl} alt="" className="size-10 dark:invert" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-5xl">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to manage workshops, trainings and client inquiries.
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-4">
              {error && (
                <div
                  role="alert"
                  className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>Couldn't sign you in. Your email may not have access yet. Ask an admin to add it.</p>
                </div>
              )}
              <Button
                variant="outline"
                size="lg"
                className="h-11 w-full gap-3 text-[15px]"
                disabled={isPending}
                onClick={signIn}
              >
                {isPending ? <LoaderCircle className="animate-spin" /> : <GoogleIcon />}
                {isPending ? "Redirecting to Google…" : "Continue with Google"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Only approved Google accounts can sign in.
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Adrian Ding. All rights reserved.
        </p>
      </div>
    </div>
  );
}

/* The brand-red side of the page, only on wide screens. The logo is drawn faintly behind the text. */
function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-10 text-brand-foreground lg:flex">
      <div className="absolute inset-0 bg-[radial-gradient(40rem_30rem_at_100%_0%,rgb(255_255_255/0.12),transparent_70%)]" />
      <img
        src={logoUrl}
        alt=""
        className="pointer-events-none absolute -right-32 -bottom-40 size-[36rem] opacity-[0.07] invert"
      />

      <div className="relative flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <img src={logoUrl} alt="" className="size-8 invert" />
        </div>
        <div className="grid leading-tight">
          <span className="text-[15px] font-semibold">Adrian Ding</span>
          <span className="text-xs text-white/70">Admin portal</span>
        </div>
      </div>

      <div className="relative flex max-w-md flex-col gap-4">
        <h2 className="font-display text-5xl leading-[1.05]">
          Everything behind the site, in one place.
        </h2>
        <p className="text-sm text-white/75">
          Publish workshops and corporate trainings, schedule sessions, and follow up on every
          inquiry and registration.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.28a12 12 0 0 0 0 10.8l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.6l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}
