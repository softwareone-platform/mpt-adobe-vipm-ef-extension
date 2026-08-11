import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { PriceListItem, Status } from '../model';

interface PriceListItemsState {
  status: Status;
  error: string | null;
  data: PriceListItem[];
}

const INITIAL_STATE: PriceListItemsState = {
  status: 'idle',
  error: null,
  data: [],
};

/**
 * Load the agreement's purchasable price list entries from the extension backend.
 *
 * The backend resolves the agreement's listing and price list server-side
 * (the portal catalog API does not allow cross-origin calls from the
 * extension) and badges each entry Adobe recommends, so entries arrive with
 * their ``recommended`` flag already set. Pass an empty ``agreementId`` to
 * keep the hook idle — callers gate the fetch on the add-items dialog being
 * open.
 */
export function usePriceListItems(
  agreementId: string,
  recommendedSkus: Set<string>,
): PriceListItemsState & {
  refresh: () => void;
} {
  const [state, setState] = useState<PriceListItemsState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  // Callers derive the set per render; refetch on content changes only.
  const skusKey = JSON.stringify(Array.from(recommendedSkus).sort());

  useEffect(() => {
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: [] });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .post(
        `/api/v2/agreements/${encodedAgreementId}/price-list-items`,
        { recommendedSkus: JSON.parse(skusKey) as string[] },
        { signal: controller.signal },
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = (response.data as { data?: PriceListItem[] }).data ?? [];
        setState({ status: 'success', error: null, data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadPriceListItems');
        setState({ status: 'error', error, data: [] });
      });

    return () => controller.abort();
  }, [agreementId, skusKey, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
