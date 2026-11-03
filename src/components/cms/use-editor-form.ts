import { useCallback, useMemo, useState } from "react";

import { useFormErrors } from "@/components/cms/use-form-errors";

/* Form state for an editor, with a dirty flag against the last saved values. */
export function useEditorForm<T extends object>(saved: T) {
  const [values, setValues] = useState(saved);
  const [baseline, setBaseline] = useState(saved);
  const [fieldNames] = useState(() => Object.keys(saved));
  const errors = useFormErrors(fieldNames);
  const { clearFieldErrors, clearErrors } = errors;

  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [baseline, values]
  );

  const setField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValues((current) => ({ ...current, [field]: value }));
      clearFieldErrors(String(field));
    },
    [clearFieldErrors]
  );

  const markSaved = useCallback(() => {
    setBaseline(values);
    clearErrors();
  }, [clearErrors, values]);

  return { values, setField, isDirty, markSaved, errors };
}
