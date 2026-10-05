import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { centavosToPesoInput, pesoInputToCentavos } from "@/lib/cms/money";

type MoneyFieldProps = {
  id?: string;
  /* Whole centavos, or null when empty. */
  value: number | null;
  onChange: (centavos: number | null) => void;
};

/* Takes pesos in the UI and gives centavos to the form. */
export function MoneyField({ id, value, onChange }: MoneyFieldProps) {
  const [text, setText] = useState(() => centavosToPesoInput(value));

  return (
    <InputGroup>
      <InputGroupAddon>₱</InputGroupAddon>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(pesoInputToCentavos(event.target.value));
        }}
        onBlur={() => setText(centavosToPesoInput(pesoInputToCentavos(text)))}
      />
    </InputGroup>
  );
}
