import { useCallback, useMemo, useState } from "react";

import { useFormErrors } from "@/components/cms/use-form-errors";
import type { FieldAliases } from "@/features/shared/error-message";

const FIRST_ERROR_SELECTOR = "[role='alert']";

function scrollToFirstError() {
  document.querySelector(FIRST_ERROR_SELECTOR)?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

/* Form state for an editor, with a dirty flag against the last saved values. */
export function useEditorForm<T extends object>(saved: T, aliases?: FieldAliases) {
  const [values, setValues] = useState(saved);
  const [baseline, setBaseline] = useState(saved);
  const [fieldNames] = useState(() => Object.keys(saved));
  const { showErrors: setErrors, clearFieldErrors, clearErrors, ...errorLists } = useFormErrors(
    fieldNames,
    aliases
  );

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

  const showErrors = useCallback(
    (error: unknown) => {
      setErrors(error);
      requestAnimationFrame(scrollToFirstError);
    },
    [setErrors]
  );

  return {
    values,
    setField,
    isDirty,
    markSaved,
    errors: {
      ...errorLists,
      showErrors,
      clearErrors
    }
  };
}
