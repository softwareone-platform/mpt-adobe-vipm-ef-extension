import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import type { AdobeCustomerData } from '../model';
import type { Status } from './useAgreementSync';

interface RequestState {
  error: string;
  status: Status;
}

const INITIAL_REQUEST_STATE: RequestState = {
  error: '',
  status: 'idle',
};

export function useGlobalSalesRequest(agreementId: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);

  const submitRequest = useCallback(async (): Promise<AdobeCustomerData | false> => {
    setState({ error: '', status: 'loading' });

    try {
      const encodedId = encodeURIComponent(agreementId);
      const response = await http.post(`/api/v2/agreements/${encodedId}/global-sales`);
      const customerData = (response.data as { data?: AdobeCustomerData } | undefined)?.data;
      if (!customerData) {
        throw new Error('Global customer response did not include customer data.');
      }
      setState({ error: '', status: 'success' });
      return customerData;
    } catch (submitError) {
      const error =
        submitError instanceof Error ? submitError.message : 'Global customer request failed.';
      setState({ error, status: 'error' });
      return false;
    }
  }, [agreementId]);

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitRequest, reset };
}
