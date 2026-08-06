import { useTranslation } from 'react-i18next';

import { Input } from '@softwareone-platform/sdk-react-ui-v0/input';
import { MediumText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import type { Agreement } from '../../shared/model';
import type { OrderDetails } from '../model';

import './DetailsStep.scss';

export interface DetailsStepProps {
  agreement: Agreement;
  details: OrderDetails;
  onDetailsChange: (details: OrderDetails) => void;
}

export function DetailsStep({ agreement, details, onDetailsChange }: DetailsStepProps) {
  const { t } = useTranslation();

  return (
    <div className="details-step" data-testid="details-step">
      <div className="details-step__header">
        <MediumText as="h2" size={4}>
          {t('Common:Order')}
        </MediumText>
      </div>
      <div className="details-step__highlights">
        <WizardHighlights agreement={agreement} />
      </div>
      <div className="details-step__inputs">
        <Input
          label={t('Renewal:Details:Additional ID')}
          labelType="optional"
          placeholder={t('Renewal:Details:Additional ID placeholder')}
          description={t('Renewal:Details:Additional ID description')}
          value={details.externalId}
          onChange={(event: { target: HTMLInputElement }) =>
            onDetailsChange({ ...details, externalId: event.target.value })
          }
          testId="order-additional-id"
        />
        <Input
          type="textarea"
          height={120}
          name="notes"
          label={t('Renewal:Details:Notes')}
          labelType="optional"
          description=" "
          placeholder={t('Renewal:Details:Notes placeholder')}
          value={details.notes}
          onChange={(event: { target: HTMLInputElement }) =>
            onDetailsChange({ ...details, notes: event.target.value })
          }
          testId="order-notes"
        />
      </div>
    </div>
  );
}
