import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { INITIAL_SYNC_STATE, SyncState } from '../model';

export function useAgreementSync(agreementId: string) {
  const [state, setState] = useState<SyncState>(INITIAL_SYNC_STATE);

  const syncAgreement = useCallback(async () => {
    if (!agreementId) {
      return;
    }

    setState((current) => ({ ...current, error: '', status: 'loading' }));

    try {
      const encodedAgreementId = encodeURIComponent(agreementId);
      await http.post(`/api/v2/agreements/${encodedAgreementId}/sync`);
      setState({
        error: '',
        lastCompleted: new Date().toLocaleString(),
        lastStatus: 'success',
        status: 'success',
      });
    } catch (syncError) {
      const error = syncError instanceof Error ? syncError.message : 'Agreement sync failed.';
      setState({
        error,
        lastCompleted: new Date().toLocaleString(),
        lastStatus: 'error',
        status: 'error',
      });
    }
  }, [agreementId]);

  return { ...state, syncAgreement };
}
