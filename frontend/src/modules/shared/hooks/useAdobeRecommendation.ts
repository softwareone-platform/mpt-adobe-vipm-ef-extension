import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import type { AdobeRecommendationData, Recommendations } from '../model';

const INITIAL_STATE: Recommendations = {
  status: 'idle',
  error: null,
  data: null,
};

export function useAdobeRecommendation(
  agreementId: string,
  sourceSku: string,
  sourceQuantity: number,
): {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  data: AdobeRecommendationData | null;
  refresh: () => void;
} {
  const [state, setState] = useState<Recommendations>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!agreementId || !sourceSku || !(sourceQuantity > 0)) {
      setState(INITIAL_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading', error: null, data: null });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .post(`/api/v2/agreements/${encodedAgreementId}/recommendations`, {
        offers: [{ offerId: sourceSku, quantity: sourceQuantity }],
      })
      .then((response) => {
        if (cancelled) return;
        const data = (response.data as { data: AdobeRecommendationData }).data;
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : 'Failed to load Adobe recommendations.';
        setState({ status: 'error', error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [agreementId, sourceSku, sourceQuantity, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
