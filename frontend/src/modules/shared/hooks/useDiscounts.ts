import { useCallback, useEffect, useRef, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { Discount, DiscountsPage } from '../model';

type SortDirection = 'asc' | 'desc';

export interface DiscountQueryOptions {
  sortBy?: string;
  sortDir?: SortDirection;
  filters?: string;
}

const INITIAL_STATE: DiscountsPage = {
  status: 'idle',
  error: null,
  data: [],
  total: 0,
};

interface DiscountsResponse {
  data?: Discount[];
  $meta?: { pagination?: { offset?: number; limit?: number; total?: number } };
}

export function useDiscounts(
  agreementId: string,
  page: number,
  pageSize: number,
  query?: DiscountQueryOptions,
): DiscountsPage & {
  refresh: () => Promise<void>;
  abort: (reason?: unknown) => void;
} {
  const [state, setState] = useState<DiscountsPage>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const sortBy = query?.sortBy?.trim() || undefined;
  const sortDir = query?.sortDir;
  const filters = query?.filters;

  useEffect(() => {
    if (!agreementId) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    const params: Record<string, string | number> = {
      agreement: agreementId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
    if (sortBy) {
      params.sortBy = sortBy;
      params.sortDir = sortDir ?? 'asc';
    }
    if (filters) {
      params.filters = filters;
    }

    http
      .get('/api/v2/discount-codes', {
        params,
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        const body = response.data as DiscountsResponse;
        const data = body.data ?? [];
        const total = body.$meta?.pagination?.total ?? data.length;
        setState({ status: 'success', error: null, data, total });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadDiscounts');
        setState((prev) => ({ ...prev, status: 'error', error }));
      });

    return () => controller.abort();
  }, [agreementId, page, pageSize, sortBy, sortDir, filters, refreshToken]);

  const refresh = useCallback(async () => {
    setRefreshToken((t) => t + 1);
  }, []);

  const abort = useCallback((reason?: unknown) => {
    controllerRef.current?.abort(reason);
  }, []);

  return { ...state, refresh, abort };
}
