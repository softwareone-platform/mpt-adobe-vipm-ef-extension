import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';

import type { RenewalPlanBody } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

/**
 * Validates the renewal plan before the wizard advances past the Items step.
 *
 * Runs the 3YC commitment floor pre-check over the whole plan (lapsing
 * subscriptions and net-new additions included), so a decrease or a disabled
 * renewal that would breach a 3YC customer's committed minimum fails here
 * instead of on a rejected order. The Adobe PREVIEW_RENEWAL quote is no
 * longer part of this validation — the endpoint stays available for a future
 * release, but this flow no longer gates on it.
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
        return true;
      });
    },
    [agreementId, run],
  );

  return { ...state, validatePlan, reset };
}
