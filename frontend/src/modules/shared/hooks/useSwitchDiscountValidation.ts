import { useCallback, useRef } from 'react';

import { http } from '@mpt-extension/sdk';

import { readRenewalPreview } from '../model';
import type { SwitchPreview } from '../model';
import type { UpgradePreviewInput } from './useUpgradeOrderRequest';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the mid-term upgrade selection, and the discount code applied to
 * its target line, before the wizard advances past the Promotions step.
 *
 * Runs Adobe's ``PREVIEW_SWITCH`` through the upgrade preview endpoint, so a
 * code Adobe refuses — unknown, expired, already redeemed or ineligible for
 * the target offer — fails in the wizard instead of on a placed order. The
 * refusals come back as ``rejectedFields`` pointing at the target offer id.
 * The accepted quote is published to the parent so Review order can show the
 * discounted price; any edit that resets the validation clears it again.
 */
export function useSwitchDiscountValidation(
  agreementId: string,
  subscriptionId: string,
  onPreview?: (preview: SwitchPreview | null) => void,
) {
  const { run, cancel, reset, ...state } = useGuardedRequest('Errors:UpgradeDiscountValidation');
  const attemptRef = useRef(0);

  const validateDiscount = useCallback(
    async (input: UpgradePreviewInput): Promise<boolean> => {
      attemptRef.current += 1;
      const attempt = attemptRef.current;

      const quote = await run(async (signal) => {
        const encodedAgreementId = encodeURIComponent(agreementId);
        const encodedSubscriptionId = encodeURIComponent(subscriptionId);
        const response = await http.post(
          `/api/v2/agreements/${encodedAgreementId}/subscriptions/${encodedSubscriptionId}/upgrade-order/preview`,
          input,
          { signal },
        );
        return readRenewalPreview(response.data);
      });

      if (attempt === attemptRef.current) {
        onPreview?.(quote === false ? null : quote);
      }
      return quote !== false;
    },
    [agreementId, subscriptionId, onPreview, run],
  );

  const resetDiscount = useCallback(() => {
    attemptRef.current += 1;
    onPreview?.(null);
    reset();
  }, [onPreview, reset]);

  return { ...state, validateDiscount, cancel, reset: resetDiscount };
}
