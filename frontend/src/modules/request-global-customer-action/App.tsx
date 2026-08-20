import { useTranslation } from 'react-i18next';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { BoldText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { useAdobeCustomer } from '../shared/hooks/useAdobeCustomer';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useGlobalSalesRequest } from '../shared/hooks/useGlobalSalesRequest';
import { useSettings } from '../shared/hooks/useSettings';
import type { AccountType } from '../shared/three-year-commitment';
import { isGlobalSalesEnabled } from '../shared/model';
import { canRequestGlobalCustomer } from '../utils/security';

import './App.scss';

export default function App() {
  const { t } = useTranslation();
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
          {t('GlobalCustomer:Title')}
        </BoldText>
      </div>

      <div className="request-global-customer-modal__content">
        {globalSalesEnabled && (
          <InlineNotification status="warning">
            {t('GlobalCustomer:AlreadyEnabled')}
          </InlineNotification>
        )}

        {status === 'error' && error && (
          <InlineNotification status="error">
            {error}
          </InlineNotification>
        )}

        {status === 'success' && (
          <InlineNotification status="success">
            {t('GlobalCustomer:Success')}
          </InlineNotification>
        )}

        <RegularText as="p" size={2} color="grey-5">
          {t('GlobalCustomer:Description')}
        </RegularText>
      </div>

      <div className="request-global-customer-modal__actions">
        <Button isDisabled={isBusy} onClick={() => close()} type="secondary">
          {t('Common:Close')}
        </Button>
        <Button
          isBusy={isBusy}
          isDisabled={!agreementId || globalSalesEnabled || isBusy}
          onClick={handleSubmit}
          type="primary"
        >
          {t('GlobalCustomer:Update global customer')}
        </Button>
      </div>
    </div>
  );
}
