import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import type { AdobeCustomerData } from '../model';
import type { ThreeYearCommitmentRequestInput } from '../three-year-commitment';
import type { Status } from './useAgreementSync';

interface RequestState {
  error: string;
  status: Status;
}

const INITIAL_REQUEST_STATE: RequestState = {
  error: '',
  status: 'idle',
};

function toBackendPayload(input: ThreeYearCommitmentRequestInput) {
  const benefit = input.benefits[0];
  const isRecommitment = benefit.recommitmentRequest != null;
  const quantities =
    (isRecommitment ? benefit.recommitmentRequest : benefit.commitmentRequest)?.minimumQuantities ??
    [];

  const payload: { licenses?: number; consumables?: number; isRecommitment: boolean } = {
    isRecommitment,
  };
  const licenses = quantities.find((q) => q.offerType === 'LICENSE')?.quantity;
  const consumables = quantities.find((q) => q.offerType === 'CONSUMABLES')?.quantity;
  if (licenses != null) payload.licenses = licenses;
  if (consumables != null) payload.consumables = consumables;

  return payload;
}

export function useThreeYearCommitmentRequest(agreementId: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);

  const submitRequest = useCallback(
    async (input: ThreeYearCommitmentRequestInput): Promise<AdobeCustomerData | false> => {
      setState({ error: '', status: 'loading' });

      try {
        const encodedId = encodeURIComponent(agreementId);
        const response = await http.post(
          `/api/v2/agreements/${encodedId}/3yc-request`,
          toBackendPayload(input),
        );
        const customerData = (response.data as { data?: AdobeCustomerData } | undefined)?.data;
        if (!customerData) {
          throw new Error('Commitment response did not include customer data.');
        }
        setState({ error: '', status: 'success' });
        return customerData;
      } catch (submitError) {
        const error =
          submitError instanceof Error ? submitError.message : 'Commitment request failed.';
        setState({ error, status: 'error' });
        return false;
      }
    },
    [agreementId],
  );

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitRequest, reset };
}
