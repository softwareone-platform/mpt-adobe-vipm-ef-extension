import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useTranslation } from 'react-i18next';

import { CurrentSubscriptionGrid } from '../components/current-subscription-grid/CurrentSubscriptionGrid';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import { Subscription } from '../../shared/model';

import './UpgradeFromStep.scss';

export function UpgradeFromStep({
  subscription,
}: {
  subscription: Subscription;
}) {
  const { t } = useTranslation();
  return (
    <div className="upgrade-from-step">
      <div className="upgrade-from-step__header">
        <RegularText as="h2" size={4}>
          {t('MidtermUpgrade:Steps:Upgrade from')}
        </RegularText>
      </div>
      <div className="upgrade-from-step__highlights">
        <WizardHighlights agreement={subscription.agreement} parties={subscription} />
      </div>
      <div className="upgrade-from-step__inline-text">
        <span className="upgrade-from-step__inline-text__pill" />
        <RegularText as="p" size={2}>
          {t('MidtermUpgrade:UpgradeFrom:Instruction')}
        </RegularText>
      </div>
      <div className="upgrade-from-step__grid">
        <CurrentSubscriptionGrid subscription={subscription} />
      </div>
      <div className="upgrade-from-step__footer-text">
        <RegularText as="p" size={1}>
          {t('MidtermUpgrade:UpgradeTo:PriceDisclaimer')}
        </RegularText>
      </div>
    </div>
  );
}
