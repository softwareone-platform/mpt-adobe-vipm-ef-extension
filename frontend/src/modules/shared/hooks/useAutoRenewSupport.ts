import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { Status } from '../model';

interface AutoRenewSupportState {
  status: Status;
  error: string | null;
  data: Record<string, boolean>;
}

const INITIAL_STATE: AutoRenewSupportState = {
  status: 'idle',
  error: null,
  data: {},
};

export function useAutoRenewSupport(
  agreementId: string,
  skus: Set<string>,
): AutoRenewSupportState & {
  refresh: () => void;
} {
  const [state, setState] = useState<AutoRenewSupportState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  const skusKey = JSON.stringify(Array.from(skus).sort());

  useEffect(() => {
    const wanted = JSON.parse(skusKey) as string[];
    if (!agreementId || wanted.length === 0) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: {} });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .post(
        `/api/v2/agreements/${encodedAgreementId}/renewal-order/auto-renew-support`,
        { skus: wanted },
        { signal: controller.signal },
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = (response.data as { data?: { skus?: Record<string, boolean> } }).data;
        setState({ status: 'success', error: null, data: data?.skus ?? {} });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadAutoRenewSupport');
        setState({ status: 'error', error, data: {} });
      });

    return () => controller.abort();
  }, [agreementId, skusKey, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
