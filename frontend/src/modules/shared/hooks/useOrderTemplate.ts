import { useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

import { i18n } from '../../../i18n/translations';
import { formatDate } from '../../utils/date';

import type { Status } from '../model';

interface OrderTemplateState {
  status: Status;
  error: string | null;
  template: string;
}

const INITIAL_STATE: OrderTemplateState = {
  status: 'idle',
  error: null,
  template: '',
};

const DATE_DIRECTIVE = /:date\[([^\]]*)\]/g;

function resolveDates(template: string): string {
  return template.replace(
    DATE_DIRECTIVE,
    (directive, value: string) => formatDate(value.trim()) ?? directive,
  );
}

export function useOrderTemplate(orderId?: string | null): OrderTemplateState {
  const [state, setState] = useState<OrderTemplateState>(INITIAL_STATE);

  useEffect(() => {
    if (!orderId) {
      setState(INITIAL_STATE);
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading', error: null, template: '' });

    const encodedId = encodeURIComponent(orderId);
    http
      .get(`/api/v2/orders/${encodedId}/render`, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const template = (response.data as { data?: { template?: string } }).data?.template ?? '';
        setState({ status: 'success', error: null, template: resolveDates(template) });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : i18n.t('Errors:LoadOrderTemplate');
        setState({ status: 'error', error, template: '' });
      });

    return () => controller.abort();
  }, [orderId]);

  return state;
}
