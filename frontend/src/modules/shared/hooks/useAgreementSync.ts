import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { i18n } from '../../../i18n/translations';
import { Agreement, INITIAL_SYNC_STATE, SyncState } from '../model';

export function useAgreementSync(agreementId: string) {
  const [state, setState] = useState<SyncState>(INITIAL_SYNC_STATE);
  const [agreement, setAgreement] = useState<Agreement | null>(null);

  const syncAgreement = useCallback(async () => {
    if (!agreementId) {
      return;
    }

    setState((current) => ({ ...current, error: '', status: 'loading' }));

    try {
      const encodedAgreementId = encodeURIComponent(agreementId);
      const response = await http.post(`/api/v2/agreements/${encodedAgreementId}/sync`);
      setAgreement((response.data as { data?: Agreement } | undefined)?.data ?? null);
      setState({
        error: '',
        lastCompleted: new Date().toLocaleString(),
        lastStatus: 'success',
        status: 'success',
      });
    } catch (syncError) {
      const error = syncError instanceof Error ? syncError.message : i18n.t('Errors:AgreementSync');
      setAgreement(null);
      setState({
        error,
        lastCompleted: new Date().toLocaleString(),
        lastStatus: 'error',
        status: 'error',
      });
    }
  }, [agreementId]);

  return { ...state, agreement, syncAgreement };
}
