import { useCallback, useRef } from 'react';

import { http } from '@mpt-extension/sdk';

import { isRenewalPreviewRequired, readRenewalPreview } from '../model';
import type { RenewalPlanBody, RenewalPreview } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

export interface RenewalPlanValidationOptions {
  /**
   * Quote the plan through Adobe's ``PREVIEW_RENEWAL``. On by default, for the
   * Items step; the Renewal step turns it off — the toggles alone cannot build
   * a basket Adobe would reject on quantity grounds, and quoting there would
   * report a quantity error against quantities the customer cannot edit yet.
   */
  quoteThroughAdobe?: boolean;
  onPreview?: (preview: RenewalPreview | null) => void;
}

/**
 * Validates the renewal plan before the wizard advances.
 *
 * Runs the 3YC commitment floor pre-check over the whole plan (lapsing
 * subscriptions and net-new additions included), so a decrease or a disabled
 * renewal that would breach a 3YC customer's committed minimum fails here
 * instead of on a rejected order. Both the Renewal and the Items step gate on
 * it, since either one can move the plan below the floor.
 *
 * On the early-renewal path the items are then quoted through Adobe's
 * ``PREVIEW_RENEWAL``, but only where the customer owns the quantities — the
 * Items step. The RENEWAL order is placed now, so Adobe is the authority on
 * the basket and rejects there what it would reject at fulfilment — an
 * increase on a product that is not fully renewed yet, or the renew-and-add
 * combination it forbids in a single order. No discount code rides this quote;
 * the codes are picked on the next step and validated by
 * ``useRenewalDiscountValidation``. At the anniversary nothing is ordered
 * today, so the 3YC pre-check is the whole gate.
 */
export function useRenewalPlanValidation(
  agreementId: string,
  { quoteThroughAdobe = true, onPreview }: RenewalPlanValidationOptions = {},
) {
  const { run, cancel, reset, ...state } = useGuardedRequest('Errors:RenewalPlanValidation');
  const attemptRef = useRef(0);

  const validatePlan = useCallback(
    async (plan: RenewalPlanBody): Promise<boolean> => {
      attemptRef.current += 1;
      const attempt = attemptRef.current;
      const publish = (preview: RenewalPreview | null) => {
        if (quoteThroughAdobe && attempt === attemptRef.current) {
          onPreview?.(preview);
        }
      };

      if (plan.subscriptions.length === 0 && plan.netNewItems.length === 0) {
        publish(null);
        return true;
      }

      const validated = await run(async (signal) => {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        await http.post(`${baseUrl}/3yc-check`, plan, { signal });
        if (quoteThroughAdobe && isRenewalPreviewRequired(plan)) {
          // The plan is built without discount selections on these steps, so
          // this quote carries no code; the codes are validated by
          // useRenewalDiscountValidation once the Promotions step picks them.
          const response = await http.post(`${baseUrl}/preview`, plan, { signal });
          return readRenewalPreview(response.data);
        }
        return null;
      });

      publish(validated === false ? null : validated);
      return validated !== false;
    },
    [agreementId, onPreview, quoteThroughAdobe, run],
  );

  const resetPlan = useCallback(() => {
    attemptRef.current += 1;
    if (quoteThroughAdobe) {
      onPreview?.(null);
    }
    reset();
  }, [onPreview, quoteThroughAdobe, reset]);

  return { ...state, validatePlan, cancel, reset: resetPlan };
}
