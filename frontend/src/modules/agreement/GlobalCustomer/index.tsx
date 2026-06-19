import { BoldText, MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { StatusIndicator } from '@softwareone-platform/sdk-react-ui-v0/status-indicator';
import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';

import { useAgreementId } from '../hooks/useAgreementId';
import { useAdobeCustomer } from '../hooks/useAdobeCustomer';
import { useSettings } from '../hooks/useSettings';
import { DetailsGroup } from '../components/details/details-group/DetailsGroup';
import { isGlobalSalesEnabled } from '../model';
import type { AccountType } from '../ThreeYearCommitment/model';
import { canRequestGlobalCustomer } from '../../utils/security';

import './index.scss';

export function GlobalCustomer() {
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
            Global customer
          </MediumText>
          <RegularText as="p" size={2} color="grey-5">
            The details of this customer&apos;s current global customer status are below.
          </RegularText>
        </header>

        {adobeCustomer.status === 'loading' && (
          <InlineNotification status="info" isStandalone>
            Loading Adobe customer details…
          </InlineNotification>
        )}
        {adobeCustomer.status === 'error' && (
          <InlineNotification status="error" isStandalone>
            {adobeCustomer.error}
          </InlineNotification>
        )}

        <div className="global-customer__groups">
          <DetailsGroup title="Current global customer status">
            <div className="global-customer__status-row">
              <span className="global-customer__status-label">Global customer status</span>
              <StatusIndicator
                isActive={globalSalesEnabled}
                yesLabel="Enabled"
                noLabel="Disabled"
              />
            </div>
          </DetailsGroup>
        </div>
      </div>

      {canRequest && (
        <aside className="global-customer__aside">
          <RegularText as="p" size={2} color="grey-5">
            {globalSalesEnabled ? (
              <>This customer is already enabled as a global customer and cannot be changed.</>
            ) : (
              <>
                To update the global customer status of this customer, click{' '}
                <BoldText as="span" size={2}>
                  Update global customer
                </BoldText>
                .
              </>
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
            Update global customer
          </Button>
        </aside>
      )}
    </div>
  );
}
