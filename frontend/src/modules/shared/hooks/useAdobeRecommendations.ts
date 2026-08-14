import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { AdobeRecommendationData, Recommendations } from '../model';

export interface RecommendationOffer {
  offerId: string;
  quantity: number;
}

const INITIAL_STATE: Recommendations = {
  status: 'idle',
  error: null,
  data: null,
};

/**
 * Fetch Adobe product recommendations for a set of held offers.
 *
 * The multi-offer sibling of :func:`useAdobeRecommendation`: the renewal
 * wizard sends the customer's whole estate so the recommendations (and the
 * tracker id replayed on submission) reflect every subscription at once.
 */
export function useAdobeRecommendations(
  agreementId: string,
  offers: RecommendationOffer[],
): Recommendations & {
  refresh: () => void;
} {
  const [state, setState] = useState<Recommendations>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  // Callers derive `offers` per render; refetch on content changes only.
  const offersKey = JSON.stringify(offers);
  const hasOffers = offers.length > 0;

  useEffect(() => {
    if (!agreementId || !hasOffers) {
      setState(INITIAL_STATE);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', error: null, data: null });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .post(`/api/v2/agreements/${encodedAgreementId}/recommendations`, {
        offers: JSON.parse(offersKey) as RecommendationOffer[],
      })
      .then((response) => {
        if (cancelled) return;
        const data = (response.data as { data: AdobeRecommendationData }).data;
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error =
          err instanceof Error ? err.message : i18n.t('Errors:LoadAdobeRecommendations');
        setState({ status: 'error', error, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [agreementId, hasOffers, offersKey, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
