import { useCallback, useState } from 'react';

import type { ThreeYearCommitmentRequestInput } from '../ThreeYearCommitment/model';
import type { Status } from './useAgreementSync';

interface RequestState {
  error: string;
  status: Status;
}

const INITIAL_REQUEST_STATE: RequestState = {
  error: '',
  status: 'idle',
};

// Simulates the backend latency before the real endpoint exists.
const MOCK_LATENCY_MS = 500;

export function useThreeYearCommitmentRequest() {
  const [state, setState] = useState<RequestState>(INITIAL_REQUEST_STATE);

  const submitRequest = useCallback(async (input: ThreeYearCommitmentRequestInput) => {
    setState({ error: '', status: 'loading' });

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
      void input;

      setState({ error: '', status: 'success' });
      return true;
    } catch (submitError) {
      const error =
        submitError instanceof Error ? submitError.message : 'Commitment request failed.';
      setState({ error, status: 'error' });
      return false;
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL_REQUEST_STATE), []);

  return { ...state, submitRequest, reset };
}
