import { useCallback, useRef } from 'react';

import { http } from '@mpt-extension/sdk';

import { isRenewalPreviewRequired, readRenewalPreview } from '../model';
import type { RenewalPlanBody, RenewalPreview } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the selected discount codes before the wizard advances past the
 * Promotions step, on the early-renewal path only.
 *
 * Runs the same Adobe ``PREVIEW_RENEWAL`` quote as the Items step gate
 * (``useRenewalPlanValidation``), this time over a plan whose lines carry the
 * flexible discount codes the customer applied to each of them, so a code
 * Adobe rejects — unknown, expired, already redeemed or ineligible for the
 * offer — fails in the wizard instead of on a placed order. Early renewal
 * orders now, so the rejection has to happen now; at the anniversary the
 * equivalent rejection surfaces on the order details page at fulfilment and
 * no preview runs here.
 */
export function useRenewalDiscountValidation(
  agreementId: string,
  onPreview?: (preview: RenewalPreview | null) => void,
) {
  const { run, cancel, reset, ...state } = useGuardedRequest('Errors:RenewalDiscountValidation');
  const attemptRef = useRef(0);

  const validateDiscounts = useCallback(
    async (plan: RenewalPlanBody): Promise<boolean> => {
      attemptRef.current += 1;
      const attempt = attemptRef.current;
      const publish = (preview: RenewalPreview | null) => {
        if (attempt === attemptRef.current) {
          onPreview?.(preview);
        }
      };

      if (!isRenewalPreviewRequired(plan)) {
        publish(null);
        return true;
      }

      const quote = await run(async (signal) => {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        const response = await http.post(`${baseUrl}/preview`, plan, { signal });
        return readRenewalPreview(response.data);
      });

      publish(quote === false ? null : quote);
      return quote !== false;
    },
    [agreementId, onPreview, run],
  );

  const resetDiscounts = useCallback(() => {
    attemptRef.current += 1;
    onPreview?.(null);
    reset();
  }, [onPreview, reset]);

  return { ...state, validateDiscounts, cancel, reset: resetDiscounts };
}
