import { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { InlineMarkdown } from '@softwareone-platform/sdk-react-ui-v0/markdown/inline';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text'

import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights'
import { useOrderTemplate } from '../../shared/hooks/useOrderTemplate';
import { Subscription } from '../../shared/model';
import { Order } from '../model';

import './SummaryStep.scss';

interface SummaryStepProps {
  subscription: Subscription;
  order: Order;
}

export function SummaryStep({ subscription, order }: SummaryStepProps): ReactElement | null {
  const { t } = useTranslation();
  const { template } = useOrderTemplate(order?.id);

  if (!order) return null;

  return (
    <div className="summary-step" data-testid='summary-step'>
      <div className="summary-step__header">
        <RegularText as="h2" size={4}>
          {t('MidtermUpgrade:Steps:Summary')}
        </RegularText>
      </div>
      <div className="summary-step__highlights">
        <WizardHighlights agreement={subscription.agreement} parties={subscription} order={order} />
      </div>
      {template && (
        <div className="summary-step__template">
          <InlineMarkdown value={template} />
        </div>
      )}
    </div>
  )
}
