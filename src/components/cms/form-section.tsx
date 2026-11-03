import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function FieldErrors({ errors }: { errors: string[] }) {
  return (
    <div role="alert" className="flex flex-col gap-0.5">
      {errors.map((message) => (
        <p key={message} className="text-xs text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}

/*
  A titled card for one group of form fields, with an icon that hints at what's inside.
  Write titles in Title Case, e.g. "Date and Time".
*/
export function FormSection({
  icon: Icon,
  title,
  description,
  errors = [],
  children
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {children}
        {errors.length > 0 && <FieldErrors errors={errors} />}
      </CardContent>
    </Card>
  );
}

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  errors?: string[];
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, errors = [], children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {errors.length > 0 ? (
        <FieldErrors errors={errors} />
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/* Errors that don't belong to one field, such as a conflict found on the server. */
export function FormErrorList({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;

  return (
    <ul
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
