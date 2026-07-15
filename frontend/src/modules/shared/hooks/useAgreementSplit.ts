import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { INITIAL_SPLIT_STATE } from '../constants';
import type { AgreementSplit, AgreementSplitState } from '../model';

export function useAgreementSplit(agreementId: string): AgreementSplitState & {
  refresh: () => void;
} {
  const [state, setState] = useState<AgreementSplitState>(INITIAL_SPLIT_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!agreementId) {
      setState(INITIAL_SPLIT_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading', error: null, data: null });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedAgreementId}/split`)
      .then((response) => {
        if (cancelled) return;
        const data = (response.data as { data: AgreementSplit | null }).data;
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : 'Failed to load agreement split.';
        setState({ status: 'error', error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [agreementId, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
