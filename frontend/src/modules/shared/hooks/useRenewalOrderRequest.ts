import { useCallback } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import type { RenewalOrderInput, RenewalOrderResult } from '../model';
import { useGuardedRequest } from './useGuardedRequest';

export function useRenewalOrderRequest(agreementId: string) {
  const { run, cancel, reset, ...state } = useGuardedRequest('Errors:OrderSubmission');

  const submitOrder = useCallback(
    (input: RenewalOrderInput): Promise<RenewalOrderResult | false> =>
      run(async (signal) => {
        const encodedAgreementId = encodeURIComponent(agreementId);
        const response = await http.post(
          `/api/v2/agreements/${encodedAgreementId}/renewal-order`,
          input,
          { signal },
        );
        const order = (response.data as { data?: RenewalOrderResult } | undefined)?.data;
        if (!order?.id) {
          throw new Error(i18n.t('Errors:OrderNoData'));
        }
        return order;
      }),
    [agreementId, run],
  );

  return { ...state, submitOrder, cancel, reset };
}
