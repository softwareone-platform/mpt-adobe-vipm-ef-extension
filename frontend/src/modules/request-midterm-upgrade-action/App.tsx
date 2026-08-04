import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useMPTContext, useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';

import { useSettingsResult } from '../shared/hooks/useSettings';
import type { AccountType } from '../shared/three-year-commitment';
import { canRequestMidtermUpgradeAction } from '../utils/security';
import { AccountRestrictedNotice } from '../shared/components/AccountRestrictedNotice/AccountRestrictedNotice';
import { useAdobeOffer } from '../shared/hooks/useAdobeOffer';
import { useAdobeRecommendation } from '../shared/hooks/useAdobeRecommendation';
import { useSubscriptionId } from '../shared/hooks/useSubscriptionId';
import { useSubscriptionSync } from '../shared/hooks/useSubscriptionSync';
import { useUpgradeOrderRequest } from '../shared/hooks/useUpgradeOrderRequest';
import { getPlaceOrderValidationError } from './placeOrderValidation';
import { Wizard } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepProps } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { Loader } from './components/loader/Loader';
import { relativeScreenHeight, relativeScreenWidth } from '../utils/window';
import { getPortalOrigin } from '../utils/link';
import { getMonthlyPrice, getYearlyPrice } from '../utils/price';
import { UpgradeFromStep } from './UpgradeFromStep';
import { UpgradeToStep } from './UpgradeToStep';
import { SplitBillingStep } from './SplitBillingStep';
import { DetailsStep } from './DetailsStep';
import { ReviewOrderStep } from './ReviewOrderStep';
import { SummaryStep } from './SummaryStep';

import type {
  Order,
  TargetSubscription,
} from './model';

import './App.scss';
import { AdobeOfferSwitchPath, AgreementSplitAllocation, getRecommendedOfferIds } from '../shared/model';
import { TERM_COMMITMENT_LABELS, TERM_PERIOD_LABELS } from '../shared/constants';

const initialOrder: Order = {
  id: null,
  status: 'New',
  type: 'Change',
};

export default function App() {
  const { t } = useTranslation();
  const context = useMPTContext<{ auth?: { account?: { type?: AccountType } } }>();
  const accountType = context.auth?.account?.type;
  const { data: settings, status: settingsStatus, refetch: refetchSettings } = useSettingsResult();
  const { close } = useMPTModal();
  const subscriptionId = useSubscriptionId();
  const { subscription, syncSubscription, error, status } = useSubscriptionSync(subscriptionId);
  const { data: offerSwitchPaths, status: offerStatus } = useAdobeOffer(
    subscription?.agreement?.id ?? '',
    subscription?.externalIds?.vendor ?? '',
  );
  const offerPaths: AdobeOfferSwitchPath[] = offerSwitchPaths ? [offerSwitchPaths] : [];
  const sourceQuantity = subscription?.lines?.[0]?.quantity ?? 0;
  const sourceSku = subscription?.lines?.[0]?.item?.externalIds?.vendor ?? '';
  const { data: recommendations } = useAdobeRecommendation(
    subscription?.agreement?.id ?? '',
    sourceSku,
    sourceQuantity,
  );
  const hasSplit = subscription?.splitStatus === 'Active';
  const split = subscription?.split ?? null;
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [selectedBuyer, setSelectedBuyer] = useState<AgreementSplitAllocation | null>(null);
  const [order, setOrder] = useState<Order>(initialOrder);
  const [targetSubscriptions, setTargetSubscriptions] = useState<TargetSubscription[]>([]);
  const [recommendationTrackerId, setRecommendationTrackerId] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<TargetSubscription | null>(null);
  const [placeOrderValidationError, setPlaceOrderValidationError] = useState<string>('');
  const {
    submitOrder,
    error: submitError,
    status: submitStatus,
  } = useUpgradeOrderRequest(subscription?.agreement?.id ?? '', subscriptionId);
  const wizardHeight = relativeScreenHeight();
  const wizardWidth = relativeScreenWidth();

  // Quantity edits rebuild the rows, so read the selected row fresh from the list.
  const currentSelectedTarget = selectedTarget
    ? (targetSubscriptions.find(
        (row) =>
          row.item.id === selectedTarget.item.id &&
          row.targetBaseOfferId === selectedTarget.targetBaseOfferId,
      ) ?? null)
    : null;

  const sourceUnitSP = subscription?.lines?.[0]?.price?.unitSP;
  const movedQuantity = currentSelectedTarget?.delta ?? 0;
  const sourceTerms = TERM_PERIOD_LABELS[subscription?.terms?.period ?? ''] ?? '—';
  const sourceCommitment = TERM_COMMITMENT_LABELS[subscription?.terms?.commitment ?? ''] ?? '—';
  const sourceReviewRow: TargetSubscription = {
    id: subscription?.id ?? null,
    name: subscription?.name ?? null,
    status: subscription?.status ?? '',
    item: {
      id: subscription?.lines?.[0]?.item?.id ?? '',
      name: subscription?.lines?.[0]?.item?.name ?? '',
      externalId: subscription?.lines?.[0]?.item?.externalIds?.vendor ?? '',
    },
    recommended: false,
    currentQuantity: sourceQuantity,
    newQuantity: sourceQuantity - movedQuantity,
    delta: -movedQuantity,
    unitSP: sourceUnitSP != null ? sourceUnitSP.toFixed(2) : '',
    spxM: getMonthlyPrice(sourceUnitSP, -movedQuantity),
    spxY: getYearlyPrice(sourceUnitSP, -movedQuantity),
    terms: sourceTerms,
    commitment: sourceCommitment,
  };
  const reviewSubscriptions = currentSelectedTarget
    ? [sourceReviewRow, currentSelectedTarget]
    : [sourceReviewRow];

  const onClose = useCallback(() => {
    close();
  }, [close]);

  const placeOrder = useCallback(async (): Promise<boolean> => {
    if (submitStatus === 'loading') {
      return false;
    }
    const validationError = getPlaceOrderValidationError(
      currentSelectedTarget,
      offerPaths,
      sourceQuantity,
    );
    setPlaceOrderValidationError(validationError ?? '');
    if (validationError || !currentSelectedTarget) {
      return false;
    }
    // The upgrade endpoint expects the switched quantity; when the target
    // subscription already exists, newQuantity also carries its current seats.
    const result = await submitOrder({
      targetOfferId: currentSelectedTarget.targetBaseOfferId ?? '',
      quantity: currentSelectedTarget.delta,
      recommendationTrackerId,
      notes: order?.notes ?? '',
      externalIds: { client: order?.externalIds?.client ?? '' },
    });
    if (!result) {
      return false;
    }
    setOrder((prev) => ({ ...prev, ...result }));
    return true;
  }, [
    submitStatus,
    currentSelectedTarget,
    offerPaths,
    sourceQuantity,
    recommendationTrackerId,
    order?.notes,
    order?.externalIds?.client,
    submitOrder,
  ]);

  const viewOrder = useCallback(() => {
    if (order?.id) {
      window.open(`${getPortalOrigin()}/commerce/orders/${order.id}`, '_top');
    }
    close();
  }, [order?.id, close]);

  const addBuyerToOrder = useCallback(
    async (buyer: { id?: string }) => {
      const selected = split?.allocations?.find(a => a.buyer?.id === buyer.id)?.buyer;
      setOrder(prev => ({ ...prev, billTo: selected ?? null }));
    },
    [split]
  );

  useEffect(() => {
    syncSubscription();
  }, [syncSubscription]);

  useEffect(() => {
    setRecommendationTrackerId(recommendations?.xRecommendationTrackerId ?? '');
  }, [recommendations]);

  useEffect(() => {
    if (!offerSwitchPaths) return;
    const recommendedOfferIds = getRecommendedOfferIds(recommendations);
    const rows: TargetSubscription[] = (offerSwitchPaths.productUpgrades ?? []).flatMap((upgrade) =>
      (upgrade.targetList ?? []).map((target) => {
        const unitSP = target.item?.unitSP;
        // The target SKU may already live on the agreement: the switch then
        // tops up that subscription's line instead of creating a new one.
        const existing = target.subscription;
        const currentQuantity = existing?.quantity ?? 0;
        return {
        id: existing?.id ?? null,
        name: existing?.name ?? null,
        status: existing?.status ?? '',
        item: {
          id: target.item?.id ?? '',
          name: target.item?.name ?? 'Item Name',
          externalId: target.item?.externalId ?? '1234567890',
        },
        targetBaseOfferId: target.targetBaseOfferId,
        recommended: recommendedOfferIds.has(target.targetBaseOfferId),
        currentQuantity,
        newQuantity: currentQuantity + sourceQuantity,
        delta: sourceQuantity,
        unitSP: unitSP != null ? unitSP.toFixed(2) : '',
        spxM: getMonthlyPrice(unitSP, sourceQuantity),
        spxY: getYearlyPrice(unitSP, sourceQuantity),
        terms: sourceTerms,
        commitment: sourceCommitment,
        };
      }),
    );
    setTargetSubscriptions(rows);
  }, [offerSwitchPaths, sourceQuantity, recommendations, sourceTerms, sourceCommitment]);

  if (status === 'error' || (status === 'success' && !subscription)) {
    return (
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <InlineNotification status="error" isStandalone>
          {error || t('MidtermUpgrade:Errors:Subscription could not be loaded')}
        </InlineNotification>
        <Button onClick={() => syncSubscription()}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (settingsStatus === 'error') {
    return (
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <InlineNotification status="error" isStandalone>
          {t('MidtermUpgrade:Errors:Settings could not be loaded')}
        </InlineNotification>
        <Button onClick={refetchSettings}>
          {t('Common:Retry')}
        </Button>
      </div>
    );
  }

  if (!subscription || settingsStatus === 'loading') {
    return (
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Loader />
      </div>
    );
  }

  if (!canRequestMidtermUpgradeAction(accountType, settings?.products, subscription.product?.id)) {
    return (
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <AccountRestrictedNotice
          title={t('MidtermUpgrade:Restricted:Title')}
          message={t('MidtermUpgrade:Restricted:Message')}
        />
      </div>
    );
  }

  const wizardSteps: (StepProps & { render: () => ReactNode })[] = [
    {
      title: t('MidtermUpgrade:Steps:Upgrade from'),
      render: () => <UpgradeFromStep subscription={subscription} />,
    },
    {
      title: t('MidtermUpgrade:Steps:Upgrade to'),
      render: () => (
        <UpgradeToStep
          subscription={subscription}
          subscriptions={targetSubscriptions}
          onSubscriptionsChange={setTargetSubscriptions}
          onSelectedTargetChange={setSelectedTarget}
          offerPaths={offerPaths}
          sourceQuantity={sourceQuantity}
          offerStatus={offerStatus}
        />
      ),
    },
    ...(hasSplit
      ? [
          {
            title: t('MidtermUpgrade:Steps:Split billing'),
            render: () => (
              <SplitBillingStep
                subscription={subscription}
                split={split}
                order={order}
                addBuyerToOrder={addBuyerToOrder}
                selectedBuyer={selectedBuyer}
                onChange={setSelectedBuyer}
              />
            ),
          },
        ]
      : []),
    {
      title: t('MidtermUpgrade:Steps:Details'),
      render: () => <DetailsStep subscription={subscription} order={order} setOrder={setOrder} />,
    },
    {
      title: t('MidtermUpgrade:Steps:Review order'),
      nextButton: { label: t('MidtermUpgrade:Actions:Place order'), isDisabled: submitStatus === 'loading' },
      render: () => (
        <ReviewOrderStep
          subscription={subscription}
          order={order}
          subscriptions={reviewSubscriptions}
          onPlaceOrder={placeOrder}
          errorMessage={placeOrderValidationError || submitError}
          isSubmitting={submitStatus === 'loading'}
        />
      ),
    },
    {
      title: t('MidtermUpgrade:Steps:Summary'),
      nextButton: { label: t('MidtermUpgrade:Actions:View order') },
      render: () => <SummaryStep subscription={subscription} order={order} />,
    },
  ];

  return (
    <BrowserRouter>
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Wizard
          stepsProps={wizardSteps.map((step) => ({ title: step.title, nextButton: step.nextButton }))}
          activeStepIndex={activeStepIndex}
          onActiveStepIndexChange={setActiveStepIndex}
          onClose={onClose}
          onSave={viewOrder}
        >
          <Wizard.Header>{t('MidtermUpgrade:Header')}</Wizard.Header>
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
