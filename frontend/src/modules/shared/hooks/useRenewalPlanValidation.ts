import { useCallback, useRef, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import type { Status } from '../model';

/** One existing subscription's renewal decision as the renewal endpoints expect it. */
export interface RenewalPlanSubscriptionSelection {
  id: string;
  offerId: string;
  renew: boolean;
  renewalQuantity: number;
}

/** A net-new product selection as the renewal endpoints expect it. */
export interface RenewalPlanNetNewItemSelection {
  offerId: string;
  quantity: number;
}

/** The renewal plan body shared by the 3YC check, preview and submission endpoints. */
export interface RenewalPlanBody {
  subscriptions: RenewalPlanSubscriptionSelection[];
  netNewItems: RenewalPlanNetNewItemSelection[];
}

interface RequestState {
  error: string;
  status: Status;
}

const INITIAL_REQUEST_STATE: RequestState = {
  error: '',
  status: 'idle',
};

function toErrorMessage(validationError: unknown): string {
  const responseData = (
    validationError as { response?: { data?: { detail?: unknown; title?: unknown } } }
  )?.response?.data;
  if (typeof responseData?.detail === 'string' && responseData.detail) {
    return responseData.detail;
  }
  if (typeof responseData?.title === 'string' && responseData.title) {
    return responseData.title;
  }
  return validationError instanceof Error
    ? validationError.message
    : i18n.t('Errors:RenewalPlanValidation');
}

/**
 * Validates the renewal plan before the wizard advances past the Items step.
 *
 * Runs the 3YC commitment floor pre-check over the whole plan (lapsing
 * subscriptions and net-new additions included), then gates the existing
 * items through an Adobe PREVIEW_RENEWAL quote so the renew decisions and
 * quantity changes fail here instead of on a rejected order. Net-new products
 * have no Adobe subscription to preview yet, and the discount codes ride on a
 * later step, so the preview carries the subscriptions only.
 */
export function useRenewalPlanValidation(agreementId: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);
  const inFlightRef = useRef(false);

  const validatePlan = useCallback(
    async (plan: RenewalPlanBody): Promise<boolean> => {
      if (inFlightRef.current) {
        return false;
      }
      if (plan.subscriptions.length === 0 && plan.netNewItems.length === 0) {
        return true;
      }
      inFlightRef.current = true;
      setState({ error: '', status: 'loading' });

      try {
        const baseUrl = `/api/v2/agreements/${encodeURIComponent(agreementId)}/renewal-order`;
        await http.post(`${baseUrl}/3yc-check`, plan);
        if (plan.subscriptions.some((subscription) => subscription.renew)) {
          await http.post(`${baseUrl}/preview`, { subscriptions: plan.subscriptions });
        }
        setState({ error: '', status: 'success' });
        return true;
      } catch (validationError) {
        setState({ error: toErrorMessage(validationError), status: 'error' });
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [agreementId],
  );

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, validatePlan, reset };
}
