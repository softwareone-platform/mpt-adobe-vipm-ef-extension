import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';

import { isRenewalPreviewRequired } from '../model';
import type { RenewalPlanBody } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the renewal plan before the wizard advances past the Items step.
 *
 * Runs the 3YC commitment floor pre-check over the whole plan (lapsing
 * subscriptions and net-new additions included), so a decrease or a disabled
 * renewal that would breach a 3YC customer's committed minimum fails here
 * instead of on a rejected order.
 *
 * On the early-renewal path the items are then quoted through Adobe's
 * ``PREVIEW_RENEWAL``: the RENEWAL order is placed now, so Adobe is the
 * authority on the basket and rejects here what it would reject at
 * fulfilment — an increase on a product that is not fully renewed yet, or the
 * renew-and-add combination it forbids in a single order. No discount code
 * rides this quote; the codes are picked on the next step and validated by
 * ``useRenewalDiscountValidation``. At the anniversary nothing is ordered
 * today, so the 3YC pre-check is the whole gate.
 */
export function useRenewalPlanValidation(agreementId: string) {
  const { run, reset, ...state } = useGuardedRequest('Errors:RenewalPlanValidation');

  const validatePlan = useCallback(
    async (plan: RenewalPlanBody): Promise<boolean> => {
      if (plan.subscriptions.length === 0 && plan.netNewItems.length === 0) {
        return true;
      }

      return run(async () => {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        await http.post(`${baseUrl}/3yc-check`, plan);
        if (isRenewalPreviewRequired(plan)) {
          await http.post(`${baseUrl}/preview`, { ...plan, flexDiscountCodes: [] });
        }
        return true;
      });
    },
    [agreementId, run],
  );

  return { ...state, validatePlan, reset };
}
