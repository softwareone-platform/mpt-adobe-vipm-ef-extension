import { useMPTContext } from '@mpt-extension/sdk-react';

import { SubscriptionContext, resolveSubscriptionId } from '../model';

export function useSubscriptionId(): string {
  const context = useMPTContext() as SubscriptionContext;

  return resolveSubscriptionId(context);
}
