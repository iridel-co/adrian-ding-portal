import { useCallback, useState } from "react";

import {
  type FieldAliases,
  type FormErrors,
  formErrors,
  NO_FORM_ERRORS
} from "@/features/shared/error-message";

/* For an input that is not part of a larger form, so every error shows under it. */
export const NO_FIELDS: readonly string[] = [];

/* Errors from a failed create or update, shown next to the fields they belong to. */
export function useFormErrors(fieldNames: readonly string[], aliases?: FieldAliases) {
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const showErrors = useCallback(
    (error: unknown) => setErrors(formErrors(error, fieldNames, aliases)),
    [aliases, fieldNames]
  );

  const clearFieldErrors = useCallback((field: string) => {
    setErrors((current) => {
      if (!current.byField[field]) return current;

      const { [field]: _cleared, ...byField } = current.byField;
      return { ...current, byField };
    });
  }, []);

  const clearErrors = useCallback(() => setErrors(NO_FORM_ERRORS), []);

  return {
    fieldErrors: errors.byField,
    generalErrors: errors.general,
    showErrors,
    clearFieldErrors,
    clearErrors
  };
}
