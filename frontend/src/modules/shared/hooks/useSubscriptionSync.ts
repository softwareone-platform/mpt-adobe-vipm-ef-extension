import { useCallback, useState } from 'react';

import { http } from '@mpt-extension/sdk';
import { INITIAL_SYNC_STATE, Subscription, SyncState } from '../model';


export function useSubscriptionSync(subscriptionId: string) {
  const [state, setState] = useState<SyncState>(INITIAL_SYNC_STATE);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const syncSubscription = useCallback(async () => {
    if (!subscriptionId) {
      return;
    }

    setState((current) => ({ ...current, error: '', status: 'loading' }));

    try {
      const encodedSubscriptionId = encodeURIComponent(subscriptionId);
      const response = await http.post(`/api/v2/subscriptions/${encodedSubscriptionId}/sync`);
      const data = (response.data as { data?: Subscription } | undefined)?.data ?? null;
      setSubscription(data);
      setState({
        error: '',
        lastCompleted: new Date().toLocaleString(),
        lastStatus: 'success',
        status: 'success',
      });
    } catch (syncError) {
      const error = syncError instanceof Error ? syncError.message : 'Subscription sync failed.';
      setSubscription(null);
      setState({
        error,
        lastCompleted: new Date().toLocaleString(),
        lastStatus: 'error',
        status: 'error',
      });
    }
  }, [subscriptionId]);

  return { ...state, subscription, syncSubscription };
}
