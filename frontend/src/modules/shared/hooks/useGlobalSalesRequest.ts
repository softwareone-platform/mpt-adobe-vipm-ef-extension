import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import type { AdobeCustomerData, Status } from '../model';

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
        throw new Error(i18n.t('Errors:GlobalCustomerNoData'));
      }
      setState({ error: '', status: 'success' });
      return customerData;
    } catch (submitError) {
      const error =
        submitError instanceof Error ? submitError.message : i18n.t('Errors:GlobalCustomerRequest');
      setState({ error, status: 'error' });
      return false;
    }
  }, [agreementId]);

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitRequest, reset };
}
