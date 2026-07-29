import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text'
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights'
import { Order } from '../model';
import { Subscription } from '../../shared/model';
import { ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n } from '../../../i18n/translations';

import './SummaryStep.scss';

export async function getTemplateForOrder(_orderId?: string | null): Promise<string> {
  if (!_orderId) {
    return '';
  }

  return `
    <div class="summary-template">
      <h3 class="summary-template__title">${i18n.t('MidtermUpgrade:Summary:Title')}</h3>
      <div class="summary-template__card">
        <h4>${i18n.t('Common:Status')}</h4>
        <p>${i18n.t('MidtermUpgrade:Summary:StatusBody')}</p>
        <h4>${i18n.t('MidtermUpgrade:Summary:NextHeading')}</h4>
        <p>${i18n.t('MidtermUpgrade:Summary:NextBody')}</p>
        <p>${i18n.t('MidtermUpgrade:Summary:NextUpdates')}</p>
      </div>
      <hr class="summary-template__divider" />
      <h4>${i18n.t('MidtermUpgrade:Summary:HelpHeading')}</h4>
      <p>${i18n.t('MidtermUpgrade:Summary:HelpContact')}</p>
      <p>${i18n.t('MidtermUpgrade:Summary:HelpSupport')}</p>
      <p>${i18n.t('MidtermUpgrade:Summary:HelpClosing')}</p>
    </div>
  `;
}

interface SummaryStepProps {
  subscription: Subscription;
  order: Order;
}

export function SummaryStep({ subscription, order }: SummaryStepProps): ReactElement | null {
  const { t } = useTranslation();
  const [template, setTemplate] = useState<string>();

  useEffect(() => {
    getTemplateForOrder(order?.id).then(setTemplate);
  }, [order?.id]);

  if (!order) return null;

  return (
    <div className="summary-step" data-testid='summary-step'>
      <div className="summary-step__header">
        <RegularText as="h2" size={4}>
          {t('MidtermUpgrade:Steps:Summary')}
        </RegularText>
      </div>
      <div className="summary-step__highlights">
        <WizardHighlights subscription={subscription} order={order} />
      </div>
      <div
        className="summary-step__template"
        dangerouslySetInnerHTML={{ __html: template ?? '' }}
      />
    </div>
  )
}
