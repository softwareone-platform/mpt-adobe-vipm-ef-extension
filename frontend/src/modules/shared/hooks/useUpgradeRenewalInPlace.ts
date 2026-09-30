import { useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { RenewalInPlace, Status } from '../model';

interface UpgradeRenewalInPlaceResult {
  status: Status;
  error: string | null;
  data: RenewalInPlace | null;
}

const INITIAL_STATE: UpgradeRenewalInPlaceResult = {
  status: 'idle',
  error: null,
  data: null,
};

/**
 * Whether a renewal in place locks the agreement against a mid-term upgrade.
 *
 * ``early`` once an early renewal is placed, ``staged`` once one is set up for
 * the anniversary, ``null`` when the agreement can be upgraded.
 */
export function useUpgradeRenewalInPlace(agreementId: string): UpgradeRenewalInPlaceResult {
  const [state, setState] = useState<UpgradeRenewalInPlaceResult>(INITIAL_STATE);

  useEffect(() => {
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, data: null });

    const encodedAgreementId = encodeURIComponent(agreementId);
    http
      .get(`/api/v2/agreements/${encodedAgreementId}/upgrade-order/renewal-in-place`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        const payload = (response.data as { data?: { renewalInPlace?: RenewalInPlace | null } })
          .data;
        setState({ status: 'success', error: null, data: payload?.renewalInPlace ?? null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error =
          err instanceof Error ? err.message : i18n.t('Errors:LoadUpgradeRenewalInPlace');
        setState({ status: 'error', error, data: null });
      });

    return () => controller.abort();
  }, [agreementId]);

  return state;
}
