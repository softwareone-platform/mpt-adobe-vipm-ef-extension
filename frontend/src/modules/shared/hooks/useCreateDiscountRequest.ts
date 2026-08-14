import { useCallback, useRef, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';

import type { DiscountCreatePayload } from '../../agreement/Discounts/components/wizard/discountDraft';
import type { Discount, Status } from '../model';

/** Server field errors keyed by the pointer's field name (`#/code` becomes `code`). */
export type DiscountFieldErrors = Record<string, string>;

interface RequestState {
  error: string;
  fieldErrors: DiscountFieldErrors;
  status: Status;
}

const INITIAL_REQUEST_STATE: RequestState = {
  error: '',
  fieldErrors: {},
  status: 'idle',
};

interface ErrorBody {
  detail?: unknown;
  title?: unknown;
  errors?: Array<{ pointer?: unknown; detail?: unknown }>;
}

function readErrorBody(submitError: unknown): ErrorBody | undefined {
  return (submitError as { response?: { data?: ErrorBody } })?.response?.data;
}

function toErrorMessage(submitError: unknown): string {
  const responseData = readErrorBody(submitError);
  if (typeof responseData?.detail === 'string' && responseData.detail) {
    return responseData.detail;
  }
  if (typeof responseData?.title === 'string' && responseData.title) {
    return responseData.title;
  }
  return submitError instanceof Error ? submitError.message : i18n.t('Errors:CreateDiscount');
}

/**
 * Map the API's JSON pointers onto draft field names.
 *
 * Draft keys are named after the wire keys, so `#/code` maps straight to
 * `code`. Nested pointers such as `#/values/0/value` have no matching form
 * field and are dropped; the human-readable `detail` still surfaces.
 */
function toFieldErrors(submitError: unknown): DiscountFieldErrors {
  const fieldErrors: DiscountFieldErrors = {};
  for (const entry of readErrorBody(submitError)?.errors ?? []) {
    if (typeof entry?.pointer !== 'string') continue;
    const field = entry.pointer.replace(/^#\//u, '');
    if (!field || field.includes('/')) continue;
    fieldErrors[field] =
      typeof entry.detail === 'string' && entry.detail
        ? entry.detail
        : i18n.t('Errors:CreateDiscount');
  }
  return fieldErrors;
}

export function useCreateDiscountRequest(agreementId: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);
  const inFlightRef = useRef(false);

  const submitRequest = useCallback(
    async (payload: DiscountCreatePayload): Promise<Discount | false> => {
      if (inFlightRef.current) {
        return false;
      }
      inFlightRef.current = true;
      setState({ error: '', fieldErrors: {}, status: 'loading' });

      try {
        const response = await http.post('/api/v2/discount-codes', payload, {
          params: { agreement: agreementId },
        });
        const discount = (response.data as { data?: Discount } | undefined)?.data;
        if (!discount?.id) {
          throw new Error(i18n.t('Errors:CreateDiscountNoData'));
        }
        setState({ error: '', fieldErrors: {}, status: 'success' });
        return discount;
      } catch (submitError) {
        setState({
          error: toErrorMessage(submitError),
          fieldErrors: toFieldErrors(submitError),
          status: 'error',
        });
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [agreementId],
  );

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitRequest, reset };
}
