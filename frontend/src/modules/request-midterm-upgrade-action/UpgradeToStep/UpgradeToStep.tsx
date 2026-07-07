import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { TargetSubscriptionGrid } from '../components/target-subscription-grid/TargetSubscriptionGrid';
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';
import { TargetSubscription } from '../model';
import { Subscription } from '../../shared/model';

import './UpgradeToStep.scss';

interface UpgradeToStepProps {
  subscription: Subscription;
  subscriptions: TargetSubscription[];
  onSubscriptionsChange: (subscriptions: TargetSubscription[]) => void;
}

export function UpgradeToStep({ subscription, subscriptions, onSubscriptionsChange }: UpgradeToStepProps) {
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
        <TargetSubscriptionGrid subscriptions={subscriptions} onSubscriptionsChange={onSubscriptionsChange} />
      </div>
      <div className="upgrade-to-step__footer-text">
        <RegularText as="p" size={1}>
          * These estimated prices include estimates of invoice charges, which are subject to change, and the actual amounts will be reflected on your next bill. Please note that any applicable taxes (e.g., VAT or sales tax) will be calculated and included in the final invoice.
        </RegularText>
      </div>
    </div>
  )
}
