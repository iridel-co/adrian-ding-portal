import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { centavosToPesoInput, pesoInputToCentavos } from "@/features/shared/money";

type MoneyFieldProps = {
  id?: string;
  /* Whole centavos, or null when empty. */
  value: number | null;
  onChange: (centavos: number | null) => void;
};

const ALLOWED_CHARACTERS = /^[\d,.]*$/;
const NUMBERS_ONLY_MESSAGE = "Use numbers only, e.g. 6,500.";

/* Adds thousands separators to the whole-peso part and keeps the typed decimals. */
function groupThousands(text: string) {
  const [whole = "", ...rest] = text.replace(/,/g, "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length > 0 ? `${grouped}.${rest.join("").slice(0, 2)}` : grouped;
}

/* Takes pesos in the UI and gives centavos to the form. Accepts digits only. */
export function MoneyField({ id, value, onChange }: MoneyFieldProps) {
  const [text, setText] = useState(() => groupThousands(centavosToPesoInput(value)));
  const [error, setError] = useState<string | null>(null);
  const errorId = id ? `${id}-format-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <InputGroup>
        <InputGroupAddon>₱</InputGroupAddon>
        <InputGroupInput
          id={id}
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            if (!ALLOWED_CHARACTERS.test(next)) {
              setError(NUMBERS_ONLY_MESSAGE);
              return;
            }
            setError(null);
            setText(groupThousands(next));
            onChange(pesoInputToCentavos(next));
          }}
          onBlur={() => {
            setError(null);
            setText(groupThousands(centavosToPesoInput(pesoInputToCentavos(text))));
          }}
        />
      </InputGroup>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
