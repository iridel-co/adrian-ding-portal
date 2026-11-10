import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { SettingsNav } from "@/components/settings-nav";
import { useEditorForm } from "@/components/cms/use-editor-form";
import { ReadState } from "@/components/table/read-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $saveCrmContactSettings, crmContactSettingsQueryOptions } from "@/features/crm/contact-settings-functions";
import { crmContactSettingsSchema, type CrmContactValues } from "@/features/crm/contact-settings-schemas";
import { AccessErrorCode } from "@/lib/access-errors";

export const Route = createFileRoute("/_app/settings/contact")({
  head: () => ({ meta: [{ title: "CRM" }] }),
  component: ContactSettingsPage
});

function settingsError(error: unknown) {
  return error instanceof Error && error.message === AccessErrorCode.AdminAccessRequired
    ? "Only portal admins can view or change these settings."
    : "Unable to load or save contact details. Try again.";
}

function ContactSettingsPage() {
  const query = useQuery(crmContactSettingsQueryOptions());
  const { crmAccess } = Route.useRouteContext();
  return <div className="mx-auto flex max-w-3xl flex-col gap-8">
    <SettingsNav isAdmin={crmAccess?.role === "admin"} />
    <div>
      <h1 className="font-display text-4xl">CRM</h1>
      <p className="mt-2 text-muted-foreground">Choose how customers can reach your team about inquiries and registrations.</p>
    </div>
    <ReadState pending={query.isPending} error={query.error} retry={() => { void query.refetch(); }}
      loadingMessage="Loading contact details…" errorMessage={settingsError}
      errorTitle={query.error?.message === AccessErrorCode.AdminAccessRequired ? "Admin access required" : undefined} />
    {query.data && !query.error && <ContactSettingsForm saved={query.data.values} isSaved={query.data.isSaved} />}
  </div>;
}

const sections = [
  { id: "corporate-contacts", title: "Corporate inquiries", fields: [
    { name: "corporatePhone", label: "Contact number", type: "tel", autoComplete: "tel", maxLength: 40,
      description: "One phone number shown in corporate inquiry emails. This does not change the public website's contact number." },
    { name: "corporateReplyTo", label: "Reply-to email", type: "email", autoComplete: "email", maxLength: 254,
      description: "One team inbox that receives customer replies to corporate inquiry emails." }
  ] },
  { id: "registration-contacts", title: "Workshop registrations", fields: [
    { name: "registrationReplyTo", label: "Reply-to email", type: "email", autoComplete: "email", maxLength: 254,
      description: "One team inbox that receives registration questions and payment proof sent by reply." }
  ] }
] as const;

export function ContactSettingsForm({ saved, isSaved }: { saved: CrmContactValues; isSaved: boolean }) {
  const form = useEditorForm(saved);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: $saveCrmContactSettings,
    onSuccess: data => {
      form.markSaved();
      client.setQueryData(crmContactSettingsQueryOptions().queryKey, data);
      toast.success("Contact details saved. New emails will use these details.");
    },
    onError: error => form.errors.showErrors(new Error(settingsError(error)))
  });
  return <Card>
    <CardHeader>
      <CardTitle><h2 className="text-xl font-semibold">Contact Details</h2></CardTitle>
      <CardDescription>{isSaved ? "Your saved contact details are in use." : "The current defaults are shown. Save these fields to manage them here."}</CardDescription>
    </CardHeader>
    <CardContent>
      <form className="space-y-6" onSubmit={event => {
        event.preventDefault();
        if (save.isPending) return;
        const parsed = crmContactSettingsSchema.safeParse(form.values);
        if (!parsed.success) { form.errors.showErrors(parsed.error); return; }
        form.errors.clearErrors();
        save.mutate({ data: parsed.data });
      }}>
        {sections.map(section => <fieldset key={section.id} disabled={save.isPending} aria-labelledby={section.id} className="min-w-0 space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
          <h3 id={section.id} className="text-sm font-semibold text-muted-foreground">{section.title}</h3>
          <div className="space-y-5">
          {section.fields.map(field => {
            const errors = form.errors.fieldErrors[field.name];
            return <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input id={field.name} type={field.type} autoComplete={field.autoComplete} required maxLength={field.maxLength}
                value={form.values[field.name]} onChange={event => form.setField(field.name, event.target.value)}
                aria-invalid={!!errors?.length} aria-describedby={`${field.name}-help${errors?.length ? ` ${field.name}-error` : ""}`} />
              <p id={`${field.name}-help`} className="text-sm text-muted-foreground">{field.description}</p>
              {errors?.length && <p id={`${field.name}-error`} role="alert" className="text-sm text-destructive">{errors.join(" ")}</p>}
            </div>;
          })}
          </div>
        </fieldset>)}
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Changes apply to new emails as soon as you save. Already queued or sent emails keep their original details. Customers still receive the original email at the address they entered on the form.
        </div>
        {form.errors.generalErrors.map(message => <p key={message} role="alert" className="text-sm text-destructive">{message}</p>)}
        <Button type="submit" disabled={save.isPending || (!form.isDirty && isSaved)}>{save.isPending ? "Saving…" : "Save changes"}</Button>
      </form>
    </CardContent>
  </Card>;
}
