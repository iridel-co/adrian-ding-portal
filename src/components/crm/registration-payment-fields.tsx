import { MoneyField } from "@/components/cms/money-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { paymentMethod } from "@/db/schema/payments";
import { paymentMethodLabels, type RegistrationDraft } from "@/features/crm/registration-presentation";
import { formatPesos } from "@/features/shared/money";

export function RegistrationPaymentFields({ registration, draft, updateDraft }: {
  registration: { id: string; priceCentavos: number };
  draft: RegistrationDraft;
  updateDraft: (patch: Partial<RegistrationDraft>) => void;
}) {
  return <>
    <p className="text-sm">
      Saved registration price: {formatPesos(registration.priceCentavos)}
    </p>
    <div className="space-y-2">
      <Label htmlFor={`${registration.id}-payment-method`}>Payment method</Label>
      <Select
        required
        value={draft.paymentMethod}
        onValueChange={(value) => {
          const method = paymentMethod.enumValues.find((method) => method === value);
          if (method) updateDraft({ paymentMethod: method });
        }}
      >
        <SelectTrigger id={`${registration.id}-payment-method`}>
          <SelectValue placeholder="Select payment method" />
        </SelectTrigger>
        <SelectContent>
          {paymentMethod.enumValues.map((method) => (
            <SelectItem key={method} value={method}>
              {paymentMethodLabels[method]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${registration.id}-paid-amount`}>Verified amount in pesos</Label>
      <MoneyField
        key={`${registration.id}-${draft.expectedUpdatedAt}`}
        id={`${registration.id}-paid-amount`}
        value={draft.amount}
        onChange={(amount) => updateDraft({ amount })}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${registration.id}-payer-name`}>Payer name</Label>
      <Input
        id={`${registration.id}-payer-name`}
        value={draft.payerName}
        required
        maxLength={200}
        onChange={(event) => updateDraft({ payerName: event.target.value })}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${registration.id}-transaction-reference`}>
        Provider transaction reference
      </Label>
      <Input
        id={`${registration.id}-transaction-reference`}
        value={draft.transactionReference}
        required
        maxLength={200}
        onChange={(event) =>
          updateDraft({ transactionReference: event.target.value })
        }
      />
    </div>
  </>;
}
