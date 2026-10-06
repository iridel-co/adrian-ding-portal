import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { slugify } from "@/features/shared/slug";

type SlugFieldProps = {
  id?: string;
  title: string;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
};

/* Follows the title until the user edits the slug by hand. */
export function SlugField({ id, title, value, onChange, disabled }: SlugFieldProps) {
  const [isManual, setIsManual] = useState(() => value !== "" && value !== slugify(title));

  useEffect(() => {
    if (isManual) return;

    const generated = slugify(title);
    if (generated !== value) onChange(generated);
  }, [isManual, onChange, title, value]);

  return (
    <Input
      id={id}
      value={value}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => {
        setIsManual(true);
        onChange(event.target.value.toLowerCase());
      }}
    />
  );
}
