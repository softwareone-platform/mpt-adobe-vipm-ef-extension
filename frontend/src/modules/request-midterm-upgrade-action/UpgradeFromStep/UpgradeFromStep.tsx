import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { CurrentSubscriptionGrid } from '../components/current-subscription-grid/CurrentSubscriptionGrid';
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';
import { Subscription } from '../../shared/model';

import './UpgradeFromStep.scss';

export function UpgradeFromStep({
  subscription,
}: {
  subscription: Subscription;
}) {
  return (
    <div className="upgrade-from-step">
      <div className="upgrade-from-step__header">
        <RegularText as="h2" size={4}>
          Upgrade from
        </RegularText>
      </div>
      <div className="upgrade-from-step__highlights">
        <WizardHighlights subscription={subscription} />
      </div>
      <div className="upgrade-from-step__inline-text">
        <span className="upgrade-from-step__inline-text__pill" />
        <RegularText as="p" size={2}>
          The subscription below will be upgraded. If the entire quantity of this subscription is upgraded, then the subscription below will be terminated.
        </RegularText>
      </div>
      <div className="upgrade-from-step__grid">
        <CurrentSubscriptionGrid subscription={subscription} />
      </div>
      <div className="upgrade-from-step__footer-text">
        <RegularText as="p" size={1}>
          * These estimated prices include estimates of invoice charges, which are subject to change, and the actual amounts will be reflected on your next bill. Please note that any applicable taxes (e.g., VAT or sales tax) will be calculated and included in the final invoice.
        </RegularText>
      </div>
    </div>
  );
}
