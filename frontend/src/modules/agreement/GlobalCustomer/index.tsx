import { BoldText, MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { StatusIndicator } from '@softwareone-platform/sdk-react-ui-v0/status-indicator';
import { Trans, useTranslation } from 'react-i18next';
import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';

import { useAgreementId } from '../../shared/hooks/useAgreementId';
import { useAdobeCustomer } from '../../shared/hooks/useAdobeCustomer';
import { useSettings } from '../../shared/hooks/useSettings';
import { DetailsGroup } from '../components/details/details-group/DetailsGroup';
import { isGlobalSalesEnabled } from '../../shared/model';
import type { AccountType } from '../../shared/three-year-commitment';
import { canRequestGlobalCustomer } from '../../utils/security';

import './index.scss';

export function GlobalCustomer() {
  const { t } = useTranslation();
  const settings = useSettings();
  const context = useMPTContext<{
    auth?: { account?: { type?: AccountType } };
    data?: { agreement?: { product?: { id?: string } } };
  }>();
  const accountType = context.auth?.account?.type;

  const { open } = useMPTModal();
  const agreementId = useAgreementId();
  const adobeCustomer = useAdobeCustomer(agreementId);
  const agreementProductId = context.data?.agreement?.product?.id;

  // Global sales can only be turned on; once enabled it stays enabled, so the
  // update action is offered only while it is still disabled.
  const globalSalesEnabled = isGlobalSalesEnabled(adobeCustomer.data);

  const products = settings?.products;
  const canRequest = canRequestGlobalCustomer(accountType, products, agreementProductId);

  return (
    <div className="global-customer__split">
      <div className="global-customer__main">
        <header className="extension__content-header">
          <MediumText as="h2" size={4} className="extension__content-title">
            {t('Agreement:Global:Title')}
          </MediumText>
          <RegularText as="p" size={2} color="grey-5">
            {t('Agreement:Global:Description')}
          </RegularText>
        </header>

        {adobeCustomer.status === 'loading' && (
          <InlineNotification status="info" isStandalone>
            {t('Agreement:Loading')}
          </InlineNotification>
        )}
        {adobeCustomer.status === 'error' && (
          <InlineNotification status="error" isStandalone>
            {adobeCustomer.error}
          </InlineNotification>
        )}

        <div className="global-customer__groups">
          <DetailsGroup title={t('Agreement:Global:Current status')}>
            <div className="global-customer__status-row">
              <span className="global-customer__status-label">{t('Agreement:Global:Global customer status')}</span>
              <StatusIndicator
                isActive={globalSalesEnabled}
                yesLabel={t('Agreement:Global:Enabled')}
                noLabel={t('Agreement:Global:Disabled')}
              />
            </div>
          </DetailsGroup>
        </div>
      </div>

      {canRequest && (
        <aside className="global-customer__aside">
          <RegularText as="p" size={2} color="grey-5">
            {globalSalesEnabled ? (
              t('Agreement:Global:AlreadyEnabled')
            ) : (
              <Trans i18nKey="Agreement:Global:UpdatePrompt">
                To update the global customer status of this customer, click <BoldText as="span" size={2}>Update global customer</BoldText>.
              </Trans>
            )}
          </RegularText>
          <Button
            isDisabled={!agreementId || globalSalesEnabled || adobeCustomer.status === 'loading'}
            type="secondary"
            onClick={() =>
              open('request-global-customer-action', {
                context,
                onClose: (data?: { customer?: typeof adobeCustomer.data }) => {
                  if (data?.customer) adobeCustomer.update(data.customer);
                },
              })
            }
          >
            {t('Agreement:Global:Update global customer')}
          </Button>
        </aside>
      )}
    </div>
  );
}
