import { useCallback, useMemo, useState } from "react";

/* Form state for an editor, with a dirty flag against the last saved values. */
export function useEditorForm<T>(saved: T) {
  const [values, setValues] = useState(saved);
  const [baseline, setBaseline] = useState(saved);

  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [baseline, values]
  );

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const markSaved = useCallback(() => setBaseline(values), [values]);

  return { values, setField, isDirty, markSaved };
}
