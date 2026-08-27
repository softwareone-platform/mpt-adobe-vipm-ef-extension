import { useCallback, useState } from "react";

import type { DiscountDraft } from "./discountDraft";
import type { DiscountField, DiscountFieldErrors } from "./discountValidation";

interface FieldErrorsState {
  errors: DiscountFieldErrors;
  setErrors: (errors: DiscountFieldErrors) => void;
  editField: (patch: Partial<DiscountDraft>) => void;
}

const DEPENDENTS: Partial<Record<keyof DiscountDraft, readonly DiscountField[]>> = {
  startDate: ["endDate"],
  endDate: ["discountLockEndDate"],
  reusable: ["discountLockEndDate"],
  discountType: ["value"],
};

export function useFieldErrors(
  updateDraft: (patch: Partial<DiscountDraft>) => void,
): FieldErrorsState {
  const [errors, setErrors] = useState<DiscountFieldErrors>({});

  const editField = useCallback(
    (patch: Partial<DiscountDraft>) => {
      updateDraft(patch);

      const stale = new Set<string>();
      for (const key of Object.keys(patch)) {
        stale.add(key);
        for (const dependent of DEPENDENTS[key as keyof DiscountDraft] ?? []) {
          stale.add(dependent);
        }
      }

      setErrors((previous) => {
        const next = { ...previous };
        let changed = false;
        for (const field of Object.keys(next) as DiscountField[]) {
          if (stale.has(field)) {
            delete next[field];
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    },
    [updateDraft],
  );

  return { errors, setErrors, editField };
}
