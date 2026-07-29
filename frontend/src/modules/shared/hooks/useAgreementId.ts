import { useMPTContext } from '@mpt-extension/sdk-react';

import { AgreementContext, resolveAgreementId } from '../model';

export function useAgreementId(): string {
  const context = useMPTContext() as AgreementContext;

  return resolveAgreementId(context);
}
