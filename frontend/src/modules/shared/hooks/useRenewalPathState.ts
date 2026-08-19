import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { RenewalPathState, Status } from '../model';

interface RenewalPathStateResult {
  status: Status;
  error: string | null;
  data: RenewalPathState | null;
}

const INITIAL_STATE: RenewalPathStateResult = {
  status: 'idle',
  error: null,
  data: null,
};

export function useRenewalPathState(agreementId: string): RenewalPathStateResult & {
  refresh: () => void;
} {
  const [state, setState] = useState<RenewalPathStateResult>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: null });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedAgreementId}/renewal-order/path-state`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = (response.data as { data?: RenewalPathState }).data ?? null;
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadRenewalPathState');
        setState({ status: 'error', error, data: null });
      });

    return () => controller.abort();
  }, [agreementId, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
