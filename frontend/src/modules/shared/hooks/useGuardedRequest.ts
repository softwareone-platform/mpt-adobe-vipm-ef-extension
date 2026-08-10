import { useCallback, useRef, useState } from 'react';

import { toErrorMessage } from '../../utils/apiError';
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

  const run = useCallback(
    async <T>(task: () => Promise<T>): Promise<T | false> => {
      if (inFlightRef.current) {
        return false;
      }
      inFlightRef.current = true;
      setState({ error: '', status: 'loading' });

      try {
        const result = await task();
        setState({ error: '', status: 'success' });
        return result;
      } catch (requestError) {
        setState({ error: toErrorMessage(requestError, fallbackErrorKey), status: 'error' });
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [fallbackErrorKey],
  );

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, run, reset };
}
