import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { RenewalStateEntry, Status } from '../model';

interface RenewalStateState {
  status: Status;
  error: string | null;
  data: Record<string, RenewalStateEntry>;
}

const INITIAL_STATE: RenewalStateState = {
  status: 'idle',
  error: null,
  data: {},
};

/**
 * How much of each subscription the customer has already early-renewed.
 *
 * The early-renewal path branches per line on this state — the renewal-state
 * label, the remainder control on a partially-renewed line and whether an
 * increase is offered — so the wizard reads it before it renders the grid.
 * Keyed by Adobe subscription id, which the subscription carries as its vendor
 * external id.
 */
export function useRenewalState(agreementId: string): RenewalStateState & {
  refresh: () => void;
} {
  const [state, setState] = useState<RenewalStateState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: {} });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedAgreementId}/renewal-order/renewal-state`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        const payload = (
          response.data as {
            data?: { subscriptions?: Record<string, RenewalStateEntry> };
          }
        ).data;
        setState({ status: 'success', error: null, data: payload?.subscriptions ?? {} });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadRenewalState');
        setState({ status: 'error', error, data: {} });
      });

    return () => controller.abort();
  }, [agreementId, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}
