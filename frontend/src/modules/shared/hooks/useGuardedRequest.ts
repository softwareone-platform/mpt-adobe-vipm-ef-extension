import { useCallback, useRef, useState } from 'react';

import { toErrorMessage, toRejectedFields } from '../../utils/apiError';
import { INITIAL_REQUEST_STATE } from '../constants';
import type { RequestState } from '../constants';

/**
 * Owns the request state shared by the hooks that POST on a user action — the
 * order submissions and the wizard step validations.
 *
 * ``run`` drives the ``idle -> loading -> success | error`` transitions around
 * the task and maps a rejection through ``toErrorMessage`` with the caller's
 * fallback key. It resolves to ``false`` both when the task rejects and when
 * the call arrives while another one is still in flight, so a double-clicked
 * button cannot submit twice — callers treat ``false`` as "did not succeed"
 * either way.
 */
export function useGuardedRequest(fallbackErrorKey: string) {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async <T>(task: (signal: AbortSignal) => Promise<T>): Promise<T | false> => {
      if (inFlightRef.current) {
        return false;
      }
      inFlightRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ error: '', status: 'loading' });

      try {
        const result = await task(controller.signal);
        setState({ error: '', rejectedFields: [], status: 'success' });
        return result;
      } catch (requestError) {
        setState(
          controller.signal.aborted
            ? INITIAL_REQUEST_STATE
            : {
                error: toErrorMessage(requestError, fallbackErrorKey),
                rejectedFields: toRejectedFields(requestError),
                status: 'error',
              },
        );
        return false;
      } finally {
        inFlightRef.current = false;
        controllerRef.current = null;
      }
    },
    [fallbackErrorKey],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, run, cancel, reset };
}
