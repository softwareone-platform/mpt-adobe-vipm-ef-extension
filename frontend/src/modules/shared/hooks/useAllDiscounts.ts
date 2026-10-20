import { useCallback, useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';
import { DISCOUNTS_FETCH_SIZE } from '../constants';

import type { Discount, DiscountCommitment, DiscountOrderType, DiscountsPage } from '../model';

const INITIAL_STATE: DiscountsPage = {
  status: 'idle',
  error: null,
  data: [],
  total: 0,
};

export interface DiscountEligibility {
  offerId?: string;
  ownedOfferIds?: string[];
  commitment?: DiscountCommitment;
}

interface DiscountsResponse {
  data?: Discount[];
  $meta?: { pagination?: { offset?: number; limit?: number; total?: number } };
}

/**
 * Read every discount in scope for the agreement, page by page.
 *
 * The renewal wizard offers the codes in a per-line dropdown, so it needs the
 * whole list rather than the page the customer happens to be looking at. With
 * an `orderType` the backend returns only the codes an order of that type can
 * still apply: the right order type, and a validity window (or discount lock,
 * for a reusable code) that has not run out.
 *
 * `eligibility` narrows the list to the codes one line can use: the line's
 * offer, the offers the customer already owns (for qualifying-SKU codes) and
 * the customer's commitment term. Every entry is optional; the backend keeps a
 * code whenever the context does not positively rule it out.
 *
 * `refresh` re-runs the read against the same agreement (used by the
 * agreement discounts grid after the create/edit wizard closes).
 */
export function useAllDiscounts(
  agreementId: string,
  orderType?: DiscountOrderType,
  eligibility?: DiscountEligibility,
): DiscountsPage & { refresh: () => Promise<void> } {
  const [state, setState] = useState<DiscountsPage>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  // Read as primitives so a caller passing a fresh object each render does
  // not re-trigger the read.
  const offerId = eligibility?.offerId ?? '';
  const ownedOfferIds = (eligibility?.ownedOfferIds ?? []).filter(Boolean).join(',');
  const commitment = eligibility?.commitment ?? '';

  useEffect(() => {
    // The codes belong to one agreement's customer, so the previous
    // agreement's list is dropped rather than shown against the new one.
    if (!agreementId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ ...INITIAL_STATE, status: 'loading' });

    async function readAll() {
      const collected: Discount[] = [];
      let total: number;
      do {
        const response = await http.get('/api/v2/discount-codes', {
          params: {
            agreement: agreementId,
            limit: DISCOUNTS_FETCH_SIZE,
            offset: collected.length,
            ...(orderType ? { orderType } : {}),
            ...(offerId ? { offerId } : {}),
            ...(ownedOfferIds ? { ownedOfferIds } : {}),
            ...(commitment ? { commitment } : {}),
          },
          signal: controller.signal,
        });
        const body = response.data as DiscountsResponse;
        const page = body.data ?? [];
        total = body.$meta?.pagination?.total ?? page.length;
        collected.push(...page);
        if (page.length === 0) break;
      } while (collected.length < total);
      return { data: collected, total };
    }

    readAll()
      .then(({ data, total }) => {
        if (controller.signal.aborted) return;
        setState({ status: 'success', error: null, data, total });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadDiscounts');
        setState((prev) => ({ ...prev, status: 'error', error }));
      });

    return () => controller.abort();
  }, [agreementId, orderType, offerId, ownedOfferIds, commitment, refreshToken]);

  const refresh = useCallback(async () => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { ...state, refresh };
}