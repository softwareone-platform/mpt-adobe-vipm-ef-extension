import { useCallback, useEffect, useRef, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';

import type { Discount, DiscountsPage } from '../model';

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
): DiscountsPage & {
  refresh: () => Promise<void>;
  abort: (reason?: unknown) => void;
} {
  const [state, setState] = useState<DiscountsPage>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!agreementId) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    http
      .get('/api/v2/discount-codes', {
        params: {
          agreement: agreementId,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
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
  }, [agreementId, page, pageSize, refreshToken]);

  const refresh = useCallback(async () => {
    setRefreshToken((t) => t + 1);
  }, []);

  const abort = useCallback((reason?: unknown) => {
    controllerRef.current?.abort(reason);
  }, []);

  return { ...state, refresh, abort };
}
