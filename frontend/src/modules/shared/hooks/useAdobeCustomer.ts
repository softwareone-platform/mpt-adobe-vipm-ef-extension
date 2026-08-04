import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { AdobeCustomer, AdobeCustomerData } from '../model';

const INITIAL_STATE: AdobeCustomer = {
  status: 'idle',
  error: null,
  data: null,
};

export function useAdobeCustomer(agreementId: string): {
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  data: AdobeCustomerData | null;
  update: (data: AdobeCustomerData) => void;
  refresh: () => void;
} {
  const [state, setState] = useState<AdobeCustomer>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!agreementId) return;

    setState({ status: 'loading', error: null, data: null });

    const encodedId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedId}/customer`)
      .then((response) => {
        const data = (response.data as { data: AdobeCustomerData }).data;
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadAdobeCustomer');
        setState({ status: 'error', error, data: null });
      });
  }, [agreementId, refreshToken]);

  const update = useCallback((data: AdobeCustomerData) => {
    setState({ status: 'success', error: null, data });
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { ...state, update, refresh };
}
