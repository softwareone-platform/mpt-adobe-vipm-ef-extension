import { useCallback, useEffect, useState } from 'react';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { StepNavigationProperties, useStepActions } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { TargetSubscriptionGrid } from '../components/target-subscription-grid/TargetSubscriptionGrid';
import { getPlaceOrderValidationError } from '../placeOrderValidation';
import { NoDataCard } from '../../shared/components/NoDataCard/NoDataCard';
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';
import { TargetSubscription } from '../model';
import { AdobeOfferSwitchPath, Status, Subscription } from '../../shared/model';

import './UpgradeToStep.scss';

interface UpgradeToStepProps {
  subscription: Subscription;
  subscriptions: TargetSubscription[];
  offerPaths: AdobeOfferSwitchPath[];
  sourceQuantity: number;
  offerStatus: Status;
  onSubscriptionsChange: (subscriptions: TargetSubscription[]) => void;
  onSelectedTargetChange?: (target: TargetSubscription | null) => void;
}

export function UpgradeToStep({ subscription, subscriptions, offerPaths, sourceQuantity, offerStatus, onSubscriptionsChange, onSelectedTargetChange }: UpgradeToStepProps) {
  const showEmptyState = subscriptions.length === 0 && offerStatus !== 'idle' && offerStatus !== 'loading';
  const { registerOnNextCallback } = useStepActions();
  const [selectedTarget, setSelectedTarget] = useState<TargetSubscription | null>(null);
  const [validationError, setValidationError] = useState('');

  const handleSelectedTargetChange = useCallback(
    (target: TargetSubscription | null) => {
      setSelectedTarget(target);
      setValidationError('');
      onSelectedTargetChange?.(target);
    },
    [onSelectedTargetChange],
  );

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const error = getPlaceOrderValidationError(selectedTarget, offerPaths, sourceQuantity);
      setValidationError(error ?? '');
      return error ? currentStepIndex : targetStepIndex;
    },
    [selectedTarget, offerPaths, sourceQuantity],
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  return (
    <div className="upgrade-to-step">
      <div className="upgrade-to-step__header">
        <RegularText as="h2" size={4}>
          Upgrade to
        </RegularText>
      </div>
      <div className="upgrade-to-step__highlights">
        <WizardHighlights subscription={subscription} />
      </div>
      <div className="upgrade-to-step__inline-text">
        <span className="upgrade-to-step__inline-text__pill" />
        <RegularText as="p" size={2}>
          Select the item to upgrade to. If a new subscription is created, auto-renewal will be enabled by default.
        </RegularText>
      </div>
      <div className="upgrade-to-step__grid">
        <TargetSubscriptionGrid
          subscriptions={subscriptions}
          offerPaths={offerPaths}
          sourceQuantity={sourceQuantity}
          onSubscriptionsChange={onSubscriptionsChange}
          onSelectedTargetChange={handleSelectedTargetChange}
        />
        {showEmptyState && (
          <div className="upgrade-to-step__empty-overlay">
            <NoDataCard
              title="No upgrades available"
              description="Adobe has not published any upgrades for this item"
            />
          </div>
        )}
      </div>
      {validationError && (
        <div className="upgrade-to-step__validation">
          <InlineNotification status="error" isStandalone>
            {validationError}
          </InlineNotification>
        </div>
      )}
      <div className="upgrade-to-step__footer-text">
        <RegularText as="p" size={1}>
          * These estimated prices include estimates of invoice charges, which are subject to change, and the actual amounts will be reflected on your next bill. Please note that any applicable taxes (e.g., VAT or sales tax) will be calculated and included in the final invoice.
        </RegularText>
      </div>
    </div>
  )
}
