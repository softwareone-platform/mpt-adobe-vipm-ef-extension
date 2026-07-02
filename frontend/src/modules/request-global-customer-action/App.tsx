import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { BoldText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useGlobalSalesRequest } from '../shared/hooks/useGlobalSalesRequest';
import { useSettings } from '../shared/hooks/useSettings';
import type { AccountType } from '../shared/threeYearCommitment';
import { isGlobalSalesEnabled } from '../shared/model';
import { canRequestGlobalCustomer } from '../utils/security';

import './App.scss';

export default function App() {
  const { close } = useMPTModal();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const canRequest = canRequestGlobalCustomer(
    context.auth?.account?.type,
    settings?.products,
    context.data?.agreement?.product?.id,
  );

  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer(agreementId);
  const { error, status, submitRequest } = useGlobalSalesRequest(agreementId);

  const isBusy = status === 'loading';
  // Global sales is a one-way switch: once enabled it cannot be changed, so the
  // confirm action stays disabled while it already holds.
  const globalSalesEnabled = isGlobalSalesEnabled(adobeCustomer.data);

  if (!canRequest) return null;

  async function handleSubmit() {
    if (!agreementId || globalSalesEnabled || isBusy) return;

    const result = await submitRequest();
    if (result) {
      close({ customer: result });
    }
  }

  return (
    <div className="request-global-customer-modal">
      <div className="request-global-customer-modal__header">
        <BoldText as="h2" size={4}>
          Update global customer
        </BoldText>
      </div>

      <div className="request-global-customer-modal__content">
        <RegularText as="p" size={2} color="grey-5">
          Enabling this customer as a global customer allows them to transact across multiple
          markets under a single account. This action cannot be undone.
        </RegularText>

        {globalSalesEnabled && (
          <InlineNotification status="warning" isStandalone>
            This customer is already enabled as a global customer.
          </InlineNotification>
        )}

        {status === 'error' && error && (
          <InlineNotification status="error" isStandalone>
            {error}
          </InlineNotification>
        )}

        {status === 'success' && (
          <InlineNotification status="success" isStandalone>
            The global customer status has been updated on Adobe.
          </InlineNotification>
        )}
      </div>

      <div className="request-global-customer-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          Close
        </Button>
        <Button
          isBusy={isBusy}
          isDisabled={!agreementId || globalSalesEnabled || isBusy}
          onClick={handleSubmit}
          type="primary"
        >
          Update global customer
        </Button>
      </div>
    </div>
  );
}
