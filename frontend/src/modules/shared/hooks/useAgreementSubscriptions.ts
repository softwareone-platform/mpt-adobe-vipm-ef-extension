import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { Status, Subscription } from '../model';

interface AgreementSubscriptionsState {
  status: Status;
  error: string | null;
  data: Subscription[];
}

const INITIAL_STATE: AgreementSubscriptionsState = {
  status: 'idle',
  error: null,
  data: [],
};

export function useAgreementSubscriptions(agreementId: string): AgreementSubscriptionsState & {
  refresh: () => void;
} {
  const [state, setState] = useState<AgreementSubscriptionsState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: [] });

    const encodedId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedId}/subscriptions`, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = (response.data as { data?: Subscription[] }).data ?? [];
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error =
          err instanceof Error ? err.message : i18n.t('Errors:LoadAgreementSubscriptions');
        setState({ status: 'error', error, data: [] });
      });

    return () => controller.abort();
  }, [agreementId, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
