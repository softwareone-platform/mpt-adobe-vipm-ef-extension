import { useTranslation } from 'react-i18next';

import { InlineMarkdown } from '@softwareone-platform/sdk-react-ui-v0/markdown/inline';
import { MediumText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import { useOrderTemplate } from '../../shared/hooks/useOrderTemplate';
import type { Agreement, RenewalOrderResult } from '../../shared/model';

import './SummaryStep.scss';

export interface SummaryStepProps {
  agreement: Agreement;
  order: RenewalOrderResult | null;
}

export function SummaryStep({ agreement, order }: SummaryStepProps) {
  const { t } = useTranslation();
  const { template } = useOrderTemplate(order?.id);

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
      {template && (
        <div className="summary-step__template">
          <InlineMarkdown value={template} />
        </div>
      )}
    </div>
  );
}
