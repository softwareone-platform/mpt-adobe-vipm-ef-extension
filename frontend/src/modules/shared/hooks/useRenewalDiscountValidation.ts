import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';

import type { RenewalPlanSubscriptionSelection } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the selected discount codes before the wizard advances past the
 * Promotions step.
 *
 * Runs the same Adobe PREVIEW_RENEWAL quote as the Items step gate
 * (``useRenewalPlanValidation``), this time with the customer's chosen
 * flexible discount codes attached to every renewing line, so a code Adobe
 * rejects — unknown, expired, or ineligible for the offer — fails here
 * instead of on a rejected order. Net-new products have no Adobe subscription
 * to preview, and a lapsing subscription carries no line, so the call is
 * skipped entirely when nothing renews.
 */
export function useRenewalDiscountValidation(agreementId: string) {
  const { run, reset, ...state } = useGuardedRequest('Errors:RenewalDiscountValidation');

  const validateDiscounts = useCallback(
    async (
      subscriptions: RenewalPlanSubscriptionSelection[],
      flexDiscountCodes: string[],
    ): Promise<boolean> => {
      if (!subscriptions.some((subscription) => subscription.renew)) {
        return true;
      }

      return run(async () => {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        await http.post(`${baseUrl}/preview`, { subscriptions, flexDiscountCodes });
        return true;
      });
    },
    [agreementId, run],
  );

  return { ...state, validateDiscounts, reset };
}
