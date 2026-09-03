import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { InheritedDiscount, Status } from '../model';

interface InheritedDiscountsState {
  status: Status;
  error: string | null;
  data: InheritedDiscount[];
}

const INITIAL_STATE: InheritedDiscountsState = {
  status: 'idle',
  error: null,
  data: [],
};

/**
 * The reusable discounts the customer already holds, per renewing line.
 *
 * The Promotions step pre-fills each renewing line with the reusable Adobe
 * would auto-apply at the anniversary — sourced from Adobe's automated renewal
 * preview, which owns the precedence between several held reusables and the
 * extended lock window — and warns about one that no longer qualifies. An empty
 * list means the customer holds no auto-applied reusables.
 */
export function useInheritedDiscounts(agreementId: string): InheritedDiscountsState & {
  refresh: () => void;
} {
  const [state, setState] = useState<InheritedDiscountsState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: [] });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedAgreementId}/renewal-order/inherited-discounts`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        const payload = (
          response.data as { data?: { inheritedDiscounts?: InheritedDiscount[] } }
        ).data;
        setState({ status: 'success', error: null, data: payload?.inheritedDiscounts ?? [] });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadInheritedDiscounts');
        setState({ status: 'error', error, data: [] });
      });

    return () => controller.abort();
  }, [agreementId, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
