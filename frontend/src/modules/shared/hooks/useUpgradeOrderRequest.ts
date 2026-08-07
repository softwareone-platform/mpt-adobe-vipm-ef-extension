import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import { useGuardedRequest } from './useGuardedRequest';

export interface UpgradeOrderInput {
  targetOfferId: string;
  quantity: number;
  recommendationTrackerId?: string;
  notes?: string;
  externalIds?: { client?: string };
}

export interface UpgradeOrderResult {
  id?: string | null;
  status?: string | null;
  type?: string | null;
}

export function useUpgradeOrderRequest(agreementId: string, subscriptionId: string) {
  const { run, reset, ...state } = useGuardedRequest('Errors:OrderSubmission');

  const submitOrder = useCallback(
    (input: UpgradeOrderInput): Promise<UpgradeOrderResult | false> =>
      run(async () => {
        const encodedAgreementId = encodeURIComponent(agreementId);
        const encodedSubscriptionId = encodeURIComponent(subscriptionId);
        const response = await http.post(
          `/api/v2/agreements/${encodedAgreementId}/subscriptions/${encodedSubscriptionId}/upgrade-order`,
          input,
        );
        const order = (response.data as { data?: UpgradeOrderResult } | undefined)?.data;
        if (!order?.id) {
          throw new Error(i18n.t('Errors:OrderNoData'));
        }
        return order;
      }),
    [agreementId, subscriptionId, run],
  );

  return { ...state, submitOrder, reset };
}
