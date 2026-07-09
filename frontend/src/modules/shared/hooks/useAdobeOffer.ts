import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import type { AdobeOfferSwitchPath, OfferSwitchPaths } from '../model';

const INITIAL_STATE: OfferSwitchPaths = {
  status: 'idle',
  error: null,
  data: null,
};

export function useAdobeOffer(
  agreementId: string,
  subscriptionId: string,
): {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  data: AdobeOfferSwitchPath | null;
  refresh: () => void;
} {
  const [state, setState] = useState<OfferSwitchPaths>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!agreementId || !subscriptionId) {
      setState(INITIAL_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading', error: null, data: null });

    const encodedAgreementId = encodeURIComponent(agreementId);
    const encodedSubscriptionId = encodeURIComponent(subscriptionId);
    http
      .get(
        `/api/v2/agreements/${encodedAgreementId}/subscriptions/${encodedSubscriptionId}/offer-switch-paths`,
      )
      .then((response) => {
        if (cancelled) return;
        const data = (response.data as { data: AdobeOfferSwitchPath }).data;
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error =
          err instanceof Error ? err.message : 'Failed to load Adobe offer switch paths.';
        setState({ status: 'error', error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [agreementId, subscriptionId, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
