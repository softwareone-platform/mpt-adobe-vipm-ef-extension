import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { Wizard } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepProps } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { AccountRestrictedNotice } from '../shared/components/AccountRestrictedNotice/AccountRestrictedNotice';
import { Loader } from '../shared/components/Loader/Loader';
import { COTERM_DATE_PARAM } from '../shared/constants';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useAgreementSubscriptions } from '../shared/hooks/useAgreementSubscriptions';
import { useAgreementSync } from '../shared/hooks/useAgreementSync';
import { useAdobeRecommendations } from '../shared/hooks/useAdobeRecommendations';
import { useSettingsResult } from '../shared/hooks/useSettings';
import { getRecommendedOfferIds, readParameter } from '../shared/model';
import type { AccountType } from '../shared/three-year-commitment';
import { canRequestRenewalAction } from '../utils/security';
import { getPartialSku } from '../utils/sku';
import { relativeScreenHeight, relativeScreenWidth } from '../utils/window';
import { ItemsStep } from './ItemsStep';
import { RenewalStep } from './RenewalStep';
import { TimingStep } from './TimingStep';
import {
  buildInitialRenewalSelections,
  type NetNewItem,
  type RenewalPath,
  type RenewalQuantities,
  type RenewalSelections,
} from './model';

import './App.scss';

export default function App() {
  const { t } = useTranslation();
  const context = useMPTContext<{ auth?: { account?: { type?: AccountType } } }>();
  const accountType = context.auth?.account?.type;
  const { data: settings, status: settingsStatus, refetch: refetchSettings } = useSettingsResult();
  const { close } = useMPTModal();
  const agreementId = useAgreementId();
  const { agreement, syncAgreement, error, status } = useAgreementSync(agreementId);
  const subscriptions = useAgreementSubscriptions(agreementId);
  const renewalDate = readParameter(agreement?.parameters?.fulfillment, COTERM_DATE_PARAM);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [renewalPath, setRenewalPath] = useState<RenewalPath>('anniversary');
  const [renewalSelections, setRenewalSelections] = useState<RenewalSelections | null>(null);
  const [renewalQuantities, setRenewalQuantities] = useState<RenewalQuantities>({});
  const [netNewItems, setNetNewItems] = useState<NetNewItem[]>([]);
  const wizardHeight = relativeScreenHeight();
  const wizardWidth = relativeScreenWidth();

  // Adobe recommends against the customer's whole estate; the tracker id on
  // the response is replayed when the renewal order is submitted.
  const recommendationOffers = useMemo(
    () =>
      subscriptions.data.flatMap((subscription) => {
        const line = subscription.lines?.[0];
        const sku = line?.item.externalIds?.vendor;
        return line && sku ? [{ offerId: sku, quantity: line.quantity }] : [];
      }),
    [subscriptions.data],
  );
  const recommendations = useAdobeRecommendations(agreementId, recommendationOffers);
  const recommendedSkus = useMemo(
    () => new Set(Array.from(getRecommendedOfferIds(recommendations.data), getPartialSku)),
    [recommendations.data],
  );

  const onClose = useCallback(() => {
    close();
  }, [close]);

  const onRenewChange = useCallback((subscriptionId: string, renew: boolean) => {
    setRenewalSelections((current) => ({ ...current, [subscriptionId]: renew }));
  }, []);

  const onRenewalQuantityChange = useCallback((subscriptionId: string, quantity: number | null) => {
    setRenewalQuantities((current) => ({ ...current, [subscriptionId]: quantity }));
  }, []);

  useEffect(() => {
    syncAgreement();
  }, [syncAgreement]);

  // Seed each Renew toggle once from the subscription's standing autoRenewal
  // preference; from then on the customer's choices live in the wizard state.
  const subscriptionsLoaded = subscriptions.status === 'success';
  const subscriptionData = subscriptions.data;
  useEffect(() => {
    if (subscriptionsLoaded) {
      setRenewalSelections(
        (current) => current ?? buildInitialRenewalSelections(subscriptionData),
      );
    }
  }, [subscriptionsLoaded, subscriptionData]);

  if (status === 'error' || (status === 'success' && !agreement)) {
    return (
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <InlineNotification status="error" isStandalone>
          {error || t('Renewal:Errors:Agreement could not be loaded')}
        </InlineNotification>
        <Button onClick={() => syncAgreement()}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (settingsStatus === 'error') {
    return (
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <InlineNotification status="error" isStandalone>
          {t('Renewal:Errors:Settings could not be loaded')}
        </InlineNotification>
        <Button onClick={refetchSettings}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (!agreement || settingsStatus === 'loading') {
    return (
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Loader />
      </div>
    );
  }

  if (!canRequestRenewalAction(accountType, settings?.products, agreement.product?.id)) {
    return (
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <AccountRestrictedNotice
          title={t('Renewal:Restricted:Title')}
          message={t('Renewal:Restricted:Message')}
        />
      </div>
    );
  }

  if (subscriptions.status === 'error') {
    return (
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <InlineNotification status="error" isStandalone>
          {subscriptions.error || t('Renewal:Errors:Subscriptions could not be loaded')}
        </InlineNotification>
        <Button onClick={subscriptions.refresh}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (subscriptions.status !== 'success') {
    return (
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Loader />
      </div>
    );
  }

  const wizardSteps: (StepProps & { render: () => ReactNode })[] = [
    {
      title: t('Renewal:Steps:Timing'),
      render: () => (
        <TimingStep
          agreement={agreement}
          renewalDate={typeof renewalDate === 'string' ? renewalDate : undefined}
          path={renewalPath}
          onPathChange={setRenewalPath}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Renewal'),
      render: () => (
        <RenewalStep
          agreement={agreement}
          subscriptions={subscriptions.data}
          selections={renewalSelections ?? {}}
          onRenewChange={onRenewChange}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Items'),
      render: () => (
        <ItemsStep
          agreement={agreement}
          subscriptions={subscriptions.data}
          selections={renewalSelections ?? {}}
          quantities={renewalQuantities}
          netNewItems={netNewItems}
          recommendedSkus={recommendedSkus}
          onQuantityChange={onRenewalQuantityChange}
          onNetNewItemsChange={setNetNewItems}
        />
      ),
    },
    { title: t('Renewal:Steps:Promotions'), render: () => null },
    { title: t('Renewal:Steps:Details'), render: () => null },
    { title: t('Renewal:Steps:Review order'), render: () => null },
    { title: t('Renewal:Steps:Summary'), render: () => null },
  ];

  return (
    <BrowserRouter>
      <div className="request-renewal__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Wizard
          stepsProps={wizardSteps.map((step) => ({ title: step.title }))}
          activeStepIndex={activeStepIndex}
          onActiveStepIndexChange={setActiveStepIndex}
          onClose={onClose}
        >
          <Wizard.Header>
            {t('Renewal:Header', { product: agreement.product?.name ?? '' })}
          </Wizard.Header>
          <Wizard.Content>
            <Wizard.Content.Steps />
            <Wizard.Content.StepContent>
              {({ activeStepIndex }) => wizardSteps[activeStepIndex]?.render() ?? null}
            </Wizard.Content.StepContent>
          </Wizard.Content>
          <Wizard.Actions />
        </Wizard>
      </div>
    </BrowserRouter>
  );
}
