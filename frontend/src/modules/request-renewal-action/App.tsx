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
import { ProgressModal } from '../shared/components/ProgressModal/ProgressModal';
import { COTERM_DATE_PARAM } from '../shared/constants';
import { useAgreementId } from '../shared/hooks/useAgreementId';
import { useAgreementSubscriptions } from '../shared/hooks/useAgreementSubscriptions';
import { useAgreementSync } from '../shared/hooks/useAgreementSync';
import { useAdobeRecommendations } from '../shared/hooks/useAdobeRecommendations';
import { useAutoRenewSupport } from '../shared/hooks/useAutoRenewSupport';
import { useRenewalState } from '../shared/hooks/useRenewalState';
import { useRenewalOrderRequest } from '../shared/hooks/useRenewalOrderRequest';
import { useRenewalPathState } from '../shared/hooks/useRenewalPathState';
import { useSettingsResult } from '../shared/hooks/useSettings';
import { canPlanRenewal, getRecommendedOfferIds, readParameter } from '../shared/model';
import type { RenewalOrderResult } from '../shared/model';
import type { AccountType } from '../shared/three-year-commitment';
import { getPortalOrigin } from '../utils/link';
import { canRequestRenewalAction } from '../utils/security';
import { getPartialSku } from '../utils/sku';
import { relativeScreenHeight, relativeScreenWidth, scrollStepToTop } from '../utils/window';
import { DetailsStep } from './DetailsStep';
import { ItemsStep } from './ItemsStep';
import { PromotionsStep } from './PromotionsStep';
import { RenewalStep } from './RenewalStep';
import { ReviewOrderStep } from './ReviewOrderStep';
import { SummaryStep } from './SummaryStep';
import { TimingStep } from './TimingStep';
import {
  buildInitialRenewalSelections,
  buildRenewalPlanRequest,
  canRenewAtAnniversary,
  getHeldSkus,
  isEarlyRenewable,
  type DiscountSelections,
  type NetNewItem,
  type OrderDetails,
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

  const changeStep = useCallback((index: number) => {
    setActiveStepIndex(index);
    scrollStepToTop();
  }, []);
  const [renewalPath, setRenewalPath] = useState<RenewalPath>('anniversary');
  const [renewalSelections, setRenewalSelections] = useState<RenewalSelections | null>(null);
  const [renewalQuantities, setRenewalQuantities] = useState<RenewalQuantities>({});
  const [netNewItems, setNetNewItems] = useState<NetNewItem[]>([]);
  const [discountSelections, setDiscountSelections] = useState<DiscountSelections>({});
  const [orderDetails, setOrderDetails] = useState<OrderDetails>({ externalId: '', notes: '' });
  const [order, setOrder] = useState<RenewalOrderResult | null>(null);
  const {
    error: submitError,
    status: submitStatus,
    submitOrder,
    cancel: cancelSubmit,
  } = useRenewalOrderRequest(agreementId);
  const wizardBox = { height: relativeScreenHeight(), width: relativeScreenWidth() };

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
  const heldSkus = useMemo(() => getHeldSkus(subscriptions.data), [subscriptions.data]);
  const autoRenewSupport = useAutoRenewSupport(agreementId, heldSkus);
  const renewalState = useRenewalState(agreementId);
  const pathState = useRenewalPathState(agreementId);
  const anniversarySubscriptions = useMemo(
    () =>
      subscriptions.data.filter((subscription) =>
        canRenewAtAnniversary(subscription, autoRenewSupport.data),
      ),
    [subscriptions.data, autoRenewSupport.data],
  );
  // The two paths route on different inputs: at the anniversary a SKU has to
  // support auto-renewal, while an early renewal orders explicitly and only
  // drops what Adobe will not early-renew at all.
  const pathSubscriptions = useMemo(
    () =>
      renewalPath === 'now'
        ? subscriptions.data.filter((subscription) =>
            isEarlyRenewable(subscription, renewalState.data),
          )
        : anniversarySubscriptions,
    [renewalPath, subscriptions.data, renewalState.data, anniversarySubscriptions],
  );
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

  const onDiscountChange = useCallback((rowId: string, code: string) => {
    setDiscountSelections((current) => ({ ...current, [rowId]: code }));
  }, []);

  const placeOrder = useCallback(async (): Promise<boolean> => {
    const plan = buildRenewalPlanRequest(
      pathSubscriptions,
      renewalSelections ?? {},
      renewalQuantities,
      netNewItems,
      renewalPath,
      discountSelections,
    );
    const placed = await submitOrder({
      ...plan,
      recommendationTrackerId: recommendations.data?.xRecommendationTrackerId ?? '',
      notes: orderDetails.notes,
      externalIds: { client: orderDetails.externalId },
    });
    if (!placed) {
      return false;
    }
    setOrder(placed);
    return true;
  }, [
    pathSubscriptions,
    renewalSelections,
    renewalQuantities,
    netNewItems,
    renewalPath,
    discountSelections,
    orderDetails,
    recommendations.data,
    submitOrder,
  ]);

  const viewOrder = useCallback(() => {
    if (order?.id) {
      window.open(`${getPortalOrigin()}/commerce/orders/${order.id}`, '_top');
    }
    close();
  }, [order?.id, close]);

  useEffect(() => {
    syncAgreement();
  }, [syncAgreement]);

  // An early renewal has already rolled the anniversary, so the rest of the
  // wizard runs on the established path rather than the default.
  const lockedPath = pathState.data?.lockedPath ?? null;

  useEffect(() => {
    if (lockedPath) {
      setRenewalPath(lockedPath);
    }
  }, [lockedPath]);

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
      <div className="request-renewal__wizard" style={wizardBox}>
        <InlineNotification status="error">
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
      <div className="request-renewal__wizard" style={wizardBox}>
        <InlineNotification status="error">
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
      <div className="request-renewal__wizard" style={wizardBox}>
        <Loader />
      </div>
    );
  }

  if (!canRequestRenewalAction(accountType, settings?.products, agreement.product?.id)) {
    return (
      <div className="request-renewal__wizard" style={wizardBox}>
        <AccountRestrictedNotice
          title={t('Renewal:Restricted:Title')}
          message={t('Renewal:Restricted:Message')}
        />
      </div>
    );
  }

  if (subscriptions.status === 'error') {
    return (
      <div className="request-renewal__wizard" style={wizardBox}>
        <InlineNotification status="error">
          {subscriptions.error || t('Renewal:Errors:Subscriptions could not be loaded')}
        </InlineNotification>
        <Button onClick={subscriptions.refresh}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  const isEarlyPath = renewalPath === 'now';

  if (!isEarlyPath && autoRenewSupport.status === 'error') {
    return (
      <div className="request-renewal__wizard" style={wizardBox}>
        <InlineNotification status="error">
          {autoRenewSupport.error || t('Errors:LoadAutoRenewSupport')}
        </InlineNotification>
        <Button onClick={autoRenewSupport.refresh}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (isEarlyPath && renewalState.status === 'error') {
    return (
      <div className="request-renewal__wizard" style={wizardBox}>
        <InlineNotification status="error">
          {renewalState.error || t('Errors:LoadRenewalState')}
        </InlineNotification>
        <Button onClick={renewalState.refresh}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (pathState.status === 'error') {
    return (
      <div className="request-renewal__wizard" style={wizardBox}>
        <InlineNotification status="error">
          {pathState.error || t('Errors:LoadRenewalPathState')}
        </InlineNotification>
        <Button onClick={pathState.refresh}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  // Each path waits only on the lookup it routes with: auto-renewal support at
  // the anniversary, the early-renewal state on the now path.
  const isRoutingPending = isEarlyPath
    ? renewalState.status !== 'success'
    : heldSkus.size > 0 && autoRenewSupport.status !== 'success';

  if (
    subscriptions.status !== 'success' ||
    isRoutingPending ||
    pathState.status !== 'success'
  ) {
    return (
      <div className="request-renewal__wizard" style={wizardBox}>
        <Loader />
      </div>
    );
  }

  const wizardSteps: (StepProps & { render: () => ReactNode })[] = [
    {
      title: t('Renewal:Steps:Timing'),
      nextButton: { isDisabled: !canPlanRenewal(pathState.data) },
      render: () => (
        <TimingStep
          agreement={agreement}
          renewalDate={typeof renewalDate === 'string' ? renewalDate : undefined}
          path={renewalPath}
          onPathChange={setRenewalPath}
          pathState={pathState.data}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Renewal'),
      render: () => (
        <RenewalStep
          agreement={agreement}
          subscriptions={pathSubscriptions}
          selections={renewalSelections ?? {}}
          quantities={renewalQuantities}
          netNewItems={netNewItems}
          path={renewalPath}
          onRenewChange={onRenewChange}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Items'),
      render: () => (
        <ItemsStep
          agreement={agreement}
          subscriptions={pathSubscriptions}
          selections={renewalSelections ?? {}}
          quantities={renewalQuantities}
          netNewItems={netNewItems}
          recommendedSkus={recommendedSkus}
          path={renewalPath}
          renewalStates={renewalState.data}
          onQuantityChange={onRenewalQuantityChange}
          onNetNewItemsChange={setNetNewItems}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Promotions'),
      render: () => (
        <PromotionsStep
          agreement={agreement}
          subscriptions={pathSubscriptions}
          selections={renewalSelections ?? {}}
          quantities={renewalQuantities}
          netNewItems={netNewItems}
          discountSelections={discountSelections}
          path={renewalPath}
          onDiscountChange={onDiscountChange}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Details'),
      render: () => (
        <DetailsStep
          agreement={agreement}
          details={orderDetails}
          onDetailsChange={setOrderDetails}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Review order'),
      nextButton: {
        label: t('Renewal:Review:Place order'),
        isDisabled: submitStatus === 'loading',
      },
      render: () => (
        <ReviewOrderStep
          agreement={agreement}
          subscriptions={pathSubscriptions}
          selections={renewalSelections ?? {}}
          quantities={renewalQuantities}
          netNewItems={netNewItems}
          details={orderDetails}
          onPlaceOrder={placeOrder}
          errorMessage={submitError}
        />
      ),
    },
    {
      title: t('Renewal:Steps:Summary'),
      nextButton: { label: t('Renewal:Summary:View order') },
      render: () => <SummaryStep agreement={agreement} order={order} />,
    },
  ];

  return (
    <BrowserRouter>
      <div className="request-renewal__wizard" style={wizardBox}>
        <Wizard
          stepsProps={wizardSteps.map((step) => ({
            title: step.title,
            nextButton: step.nextButton,
          }))}
          activeStepIndex={activeStepIndex}
          onActiveStepIndexChange={changeStep}
          onClose={onClose}
          onSave={viewOrder}
          isToDisableSideNavigation={Boolean(order?.id)}
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
        <ProgressModal
          isOpen={submitStatus === 'loading'}
          label={t('Common:Placing order')}
          onCancel={cancelSubmit}
        />
      </div>
    </BrowserRouter>
  );
}
