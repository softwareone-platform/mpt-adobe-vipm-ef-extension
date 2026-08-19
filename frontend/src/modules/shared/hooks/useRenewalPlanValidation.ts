import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';

import { isRenewalPreviewRequired } from '../model';
import type { RenewalPlanBody } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

export interface RenewalPlanValidationOptions {
  /**
   * Quote the plan through Adobe's ``PREVIEW_RENEWAL``. On by default, for the
   * Items step; the Renewal step turns it off — the toggles alone cannot build
   * a basket Adobe would reject on quantity grounds, and quoting there would
   * report a quantity error against quantities the customer cannot edit yet.
   */
  quoteThroughAdobe?: boolean;
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
  { quoteThroughAdobe = true }: RenewalPlanValidationOptions = {},
) {
  const { run, reset, ...state } = useGuardedRequest('Errors:RenewalPlanValidation');

  const validatePlan = useCallback(
    async (plan: RenewalPlanBody): Promise<boolean> => {
      if (plan.subscriptions.length === 0 && plan.netNewItems.length === 0) {
        return true;
      }

      return run(async () => {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        await http.post(`${baseUrl}/3yc-check`, plan);
        if (quoteThroughAdobe && isRenewalPreviewRequired(plan)) {
          await http.post(`${baseUrl}/preview`, { ...plan, flexDiscountCodes: [] });
        }
        return true;
      });
    },
    [agreementId, quoteThroughAdobe, run],
  );

  return { ...state, validatePlan, reset };
}
