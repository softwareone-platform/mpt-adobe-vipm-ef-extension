import { useCallback, useRef, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import type { Status } from '../model';

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

interface RequestState {
  error: string;
  status: Status;
}

const INITIAL_REQUEST_STATE: RequestState = {
  error: '',
  status: 'idle',
};

function toErrorMessage(submitError: unknown): string {
  const responseData = (submitError as { response?: { data?: { detail?: unknown; title?: unknown } } })
    ?.response?.data;
  if (typeof responseData?.detail === 'string' && responseData.detail) {
    return responseData.detail;
  }
  if (typeof responseData?.title === 'string' && responseData.title) {
    return responseData.title;
  }
  return submitError instanceof Error ? submitError.message : i18n.t('Errors:OrderSubmission');
}

export function useUpgradeOrderRequest(agreementId: string, subscriptionId: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);
  const inFlightRef = useRef(false);

  const submitOrder = useCallback(
    async (input: UpgradeOrderInput): Promise<UpgradeOrderResult | false> => {
      if (inFlightRef.current) {
        return false;
      }
      inFlightRef.current = true;
      setState({ error: '', status: 'loading' });

      try {
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
        setState({ error: '', status: 'success' });
        return order;
      } catch (submitError) {
        setState({ error: toErrorMessage(submitError), status: 'error' });
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [agreementId, subscriptionId],
  );

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitOrder, reset };
}
