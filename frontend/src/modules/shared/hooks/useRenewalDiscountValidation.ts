import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';

import { isRenewalPreviewRequired } from '../model';
import type { RenewalPlanBody } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the selected discount codes before the wizard advances past the
 * Promotions step, on the early-renewal path only.
 *
 * Runs the same Adobe ``PREVIEW_RENEWAL`` quote as the Items step gate
 * (``useRenewalPlanValidation``), this time with the customer's chosen
 * flexible discount codes attached to every line, so a code Adobe rejects —
 * unknown, expired, already redeemed or ineligible for the offer — fails in
 * the wizard instead of on a placed order. Early renewal orders now, so the
 * rejection has to happen now; at the anniversary the equivalent rejection
 * surfaces on the order details page at fulfilment and no preview runs here.
 */
export function useRenewalDiscountValidation(agreementId: string) {
  const { run, reset, ...state } = useGuardedRequest('Errors:RenewalDiscountValidation');

  const validateDiscounts = useCallback(
    async (plan: RenewalPlanBody, flexDiscountCodes: string[]): Promise<boolean> => {
      if (!isRenewalPreviewRequired(plan)) {
        return true;
      }

      return run(async () => {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        await http.post(`${baseUrl}/preview`, { ...plan, flexDiscountCodes });
        return true;
      });
    },
    [agreementId, run],
  );

  return { ...state, validateDiscounts, reset };
}
