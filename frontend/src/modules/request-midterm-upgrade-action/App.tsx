import { useCallback, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useMPTModal } from '@mpt-extension/sdk-react';
import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';

import { useAdobeOffer } from '../shared/hooks/useAdobeOffer';
import { useAdobeRecommendation } from '../shared/hooks/useAdobeRecommendation';
import { useSubscriptionId } from '../shared/hooks/useSubscriptionId';
import { useSubscriptionSync } from '../shared/hooks/useSubscriptionSync';
import { Wizard } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepProps } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { Loader } from './components/loader/Loader';
import { relativeScreenHeight, relativeScreenWidth } from '../utils/window';
import { getPortalOrigin } from '../utils/link';
import { UpgradeFromStep } from './UpgradeFromStep';
import { UpgradeToStep } from './UpgradeToStep';
import { SplitBillingStep } from './SplitBillingStep';
import { DetailsStep } from './DetailsStep';
import { ReviewOrderStep } from './ReviewOrderStep';
import { SummaryStep } from './SummaryStep';

import type {
  Order,
  SplitBillingAgreement,
  SplitBillingAgreementAllocation,
  TargetSubscription,
} from './model';

import './App.scss';
import { AdobeOfferSwitchPath, getRecommendedOfferIds } from '../shared/model';

const steps: StepProps[] = [
  { title: 'Upgrade from' },
  { title: 'Upgrade to' },
  { title: 'Split billing' },
  { title: 'Details' },
  { title: 'Review order', nextButton: { label: 'Place order' } },
  { title: 'Summary', nextButton: { label: 'View order' } },
];

const agreement: SplitBillingAgreement = {
  id: 'AGR-1111-1111',
  buyer: {
    id: 'BUY-1111-1111',
    name: 'Buyer Name',
  },
  allocations: [
    {
      id: 'ALL-1111-1111',
      buyer: {
        id: 'BUY-1111-1111',
        name: 'Buyer Name',
      },
      percentage: 60,
      price: {
        currency: 'USD',
        SPxY: 1200,
        SPxM: 100,
        PPxY: 1000,
        PPxM: 83.33,
      },
    },
    {
      id: 'ALL-2222-2222',
      buyer: {
        id: 'BUY-2222-2222',
        name: 'Second Buyer Name',
      },
      percentage: 40,
      price: {
        currency: 'USD',
        SPxY: 800,
        SPxM: 66.67,
        PPxY: 666.67,
        PPxM: 55.56,
      },
    },
  ],
};

const initialOrder: Order = {
  id: 'ORD-1111-1111',
  status: 'New',
  type: 'Change',
  billTo: {
    id: 'BUY-1111-1111',
    name: 'Buyer Name',
  },
};

export default function App() {
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
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [selectedBuyer, setSelectedBuyer] = useState<SplitBillingAgreementAllocation>({});
  const [order, setOrder] = useState<Order>(initialOrder);
  const [targetSubscriptions, setTargetSubscriptions] = useState<TargetSubscription[]>([]);
  const [recommendationTrackerId, setRecommendationTrackerId] = useState<string>('');
  const wizardHeight = relativeScreenHeight();
  const wizardWidth = relativeScreenWidth();

  const onClose = useCallback(() => {
    close();
  }, [close]);

  const viewOrder = useCallback(() => {
    if (order?.id) {
      window.open(`${getPortalOrigin()}/commerce/orders/${order.id}`, '_top');
    }
    close();
  }, [order?.id, close]);

  const addBuyerToOrder = useCallback(
    async (buyer: { id?: string }) => {
      const selected = agreement.allocations?.find(a => a.buyer?.id === buyer.id)?.buyer;
      if (!selected) return;
      setOrder(prev => ({ ...prev, billTo: selected }));
    },
    []
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
        return {
        id: null,
        name: null,
        status: '',
        item: {
          id: target.item?.id ?? '',
          name: target.item?.name ?? 'Item Name',
          externalId: target.item?.externalId ?? '1234567890',
        },
        recommended: recommendedOfferIds.has(target.targetBaseOfferId),
        currentQuantity: 0,
        newQuantity: sourceQuantity,
        delta: sourceQuantity,
        unitSP: unitSP != null ? unitSP.toFixed(2) : '',
        spxM: unitSP != null ? (unitSP * sourceQuantity / 12).toFixed(2) : '',
        spxY: unitSP != null ? (unitSP * sourceQuantity).toFixed(2) : '',
        terms: '',
        commitment: '',
        };
      }),
    );
    setTargetSubscriptions(rows);
  }, [offerSwitchPaths, sourceQuantity, recommendations]);

  if (status === 'error' || (status === 'success' && !subscription)) {
    return (
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <InlineNotification status="error" isStandalone>
          {error || 'Subscription could not be loaded.'}
        </InlineNotification>
        <Button onClick={() => syncSubscription()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Loader />
      </div>
    );
  }

  return (
    <MemoryRouter>
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Wizard
          stepsProps={steps}
          activeStepIndex={activeStepIndex}
          onActiveStepIndexChange={setActiveStepIndex}
          onClose={onClose}
          onSave={viewOrder}
        >
          <Wizard.Header>Upgrade subscription</Wizard.Header>
          <Wizard.Content>
            <Wizard.Content.Steps />
            <Wizard.Content.StepContent>
              {({ activeStepIndex }) => {
                switch (activeStepIndex) {
                  case 0:
                    return <UpgradeFromStep subscription={subscription} />;
                  case 1:
                    return (
                      <UpgradeToStep
                        subscription={subscription}
                        subscriptions={targetSubscriptions}
                        onSubscriptionsChange={setTargetSubscriptions}
                        offerPaths={offerPaths}
                        sourceQuantity={sourceQuantity}
                        offerStatus={offerStatus}
                      />
                    );
                  case 2:
                    return (
                      <SplitBillingStep
                        subscription={subscription}
                        agreement={agreement}
                        order={order}
                        addBuyerToOrder={addBuyerToOrder}
                        selectedBuyer={selectedBuyer}
                        onChange={setSelectedBuyer}
                      />
                    );
                  case 3:
                    return <DetailsStep subscription={subscription} order={order} setOrder={setOrder} />;
                  case 4:
                    return <ReviewOrderStep subscription={subscription} order={order} subscriptions={targetSubscriptions} recommendationTrackerId={recommendationTrackerId} />;
                  case 5:
                    return <SummaryStep subscription={subscription} order={order} />;
                  default:
                    return null;
                }
              }}
            </Wizard.Content.StepContent>
          </Wizard.Content>
          <Wizard.Actions />
        </Wizard>
      </div>
    </MemoryRouter>
  );
}
