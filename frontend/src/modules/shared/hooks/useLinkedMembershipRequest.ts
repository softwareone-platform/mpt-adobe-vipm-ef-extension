import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import { INITIAL_REQUEST_STATE } from '../constants';
import type { RequestState } from '../constants';
import type { AdobeCustomerData } from '../model';
import type { LinkedMembershipRequestInput } from '../linked-membership';

export function useLinkedMembershipRequest(agreementId: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);

  const submitRequest = useCallback(
    async (input: LinkedMembershipRequestInput): Promise<AdobeCustomerData | false> => {
      setState({ error: '', status: 'loading' });

      try {
        const encodedId = encodeURIComponent(agreementId);
        const response = await http.post(
          `/api/v2/agreements/${encodedId}/linked-membership`,
          { name: input.name, type: input.type },
        );
        const customerData = (response.data as { data?: AdobeCustomerData } | undefined)?.data;
        if (!customerData) {
          throw new Error(i18n.t('Errors:LinkedMembershipNoData'));
        }
        setState({ error: '', status: 'success' });
        return customerData;
      } catch (submitError) {
        const error =
          submitError instanceof Error ? submitError.message : i18n.t('Errors:LinkedMembershipRequest');
        setState({ error, status: 'error' });
        return false;
      }
    },
    [agreementId],
  );

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitRequest, reset };
}
