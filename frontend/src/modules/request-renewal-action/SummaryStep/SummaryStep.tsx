import { useTranslation } from 'react-i18next';

import { MediumText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { i18n } from '../../../i18n/translations';
import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import type { Agreement, RenewalOrderResult } from '../../shared/model';

import './SummaryStep.scss';

export interface SummaryStepProps {
  agreement: Agreement;
  order: RenewalOrderResult | null;
}

export function getTemplateForOrder(orderId?: string | null): string {
  if (!orderId) {
    return '';
  }

  return `
    <div class="summary-template">
      <h3 class="summary-template__title">${i18n.t('Renewal:Summary:Title')}</h3>
      <div class="summary-template__card">
        <h4>${i18n.t('Common:Status')}</h4>
        <p>${i18n.t('Renewal:Summary:StatusBody')}</p>
        <h4>${i18n.t('Renewal:Summary:NextHeading')}</h4>
        <p>${i18n.t('Renewal:Summary:NextBody')}</p>
        <p>${i18n.t('Renewal:Summary:NextUpdates')}</p>
      </div>
      <hr class="summary-template__divider" />
      <h4>${i18n.t('Renewal:Summary:HelpHeading')}</h4>
      <p>${i18n.t('Renewal:Summary:HelpContact')}</p>
      <p>${i18n.t('Renewal:Summary:HelpSupport')}</p>
      <p>${i18n.t('Renewal:Summary:HelpClosing')}</p>
    </div>
  `;
}

export function SummaryStep({ agreement, order }: SummaryStepProps) {
  const { t } = useTranslation();

  if (!order?.id) return null;

  return (
    <div className="summary-step" data-testid="summary-step">
      <div className="summary-step__header">
        <MediumText as="h2" size={4}>
          {t('Renewal:Steps:Summary')}
        </MediumText>
      </div>
      <div className="summary-step__highlights">
        <WizardHighlights agreement={agreement} order={order} />
      </div>
      <div
        className="summary-step__template"
        dangerouslySetInnerHTML={{ __html: getTemplateForOrder(order.id) }}
      />
    </div>
  );
}
