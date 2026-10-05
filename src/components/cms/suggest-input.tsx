import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { venueSuggestionsQueryOptions } from "@/lib/cms/sessions.functions";

type VenueSuggestInputProps = {
  id?: string;
  field: "venueName" | "city";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/* A text input that suggests venue names or cities used before. */
export function VenueSuggestInput({
  id,
  field,
  value,
  onChange,
  placeholder
}: VenueSuggestInputProps) {
  const listId = useId();
  const suggestions = useQuery(venueSuggestionsQueryOptions({ field, query: value }));

  return (
    <>
      <Input
        id={id}
        list={listId}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {suggestions.data?.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}
