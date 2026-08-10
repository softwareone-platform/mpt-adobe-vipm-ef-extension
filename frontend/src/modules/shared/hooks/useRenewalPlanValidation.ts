import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';

import type { RenewalPlanBody } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the renewal plan before the wizard advances past the Items step.
 *
 * Runs the 3YC commitment floor pre-check over the whole plan (lapsing
 * subscriptions and net-new additions included), then gates the existing
 * items through an Adobe PREVIEW_RENEWAL quote so the renew decisions and
 * quantity changes fail here instead of on a rejected order. Net-new products
 * have no Adobe subscription to preview yet, and the discount codes ride on a
 * later step, so the preview carries the subscriptions only.
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
        if (plan.subscriptions.some((subscription) => subscription.renew)) {
          await http.post(`${baseUrl}/preview`, { subscriptions: plan.subscriptions });
        }
        return true;
      });
    },
    [agreementId, run],
  );

  return { ...state, validatePlan, reset };
}
