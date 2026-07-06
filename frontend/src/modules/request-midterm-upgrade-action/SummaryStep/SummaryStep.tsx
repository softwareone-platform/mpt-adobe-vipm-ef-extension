import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text'
import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights'
import { Order } from '../model';
import { Subscription } from '../../shared/model';
import { ReactElement, useEffect, useState } from 'react';

import './SummaryStep.scss';

export async function getTemplateForOrder(_orderId?: string | null): Promise<string> {
  if (!_orderId) {
    return '';
  }

  return `
    <div class="summary-template">
      <h3 class="summary-template__title">Your order is being processed</h3>
      <div class="summary-template__card">
        <h4>Status</h4>
        <p>Your order is currently being processed. No action is required from you at this stage.</p>
        <h4>What happens next</h4>
        <p>If everything proceeds as expected, your order will complete automatically. If additional information is required, you'll be notified here.</p>
        <p>Updates will be provided as your order progresses.</p>
      </div>
      <hr class="summary-template__divider" />
      <h4>Need help?</h4>
      <p>If you have questions or need assistance, please contact your SoftwareOne account team.</p>
      <p>For technical support related to the SoftwareOne Marketplace, find out how to <a href="https://docs.softwareone.com" target="_blank" rel="noreferrer">contact support</a> in our online documentation.</p>
      <p>We're here to help.</p>
    </div>
  `;
}

interface SummaryStepProps {
  subscription: Subscription;
  order: Order;
}

export function SummaryStep({ subscription, order }: SummaryStepProps): ReactElement | null {
  const [template, setTemplate] = useState<string>();

  useEffect(() => {
    getTemplateForOrder(order?.id).then(setTemplate);
  }, [order?.id]);

  if (!order) return null;

  return (
    <div className="summary-step" data-testid='summary-step'>
      <div className="summary-step__header">
        <RegularText as="h2" size={4}>
          Summary
        </RegularText>
      </div>
      <div className="summary-step__highlights">
        <WizardHighlights subscription={subscription} />
      </div>
      <div
        className="summary-step__template"
        dangerouslySetInnerHTML={{ __html: template ?? '' }}
      />
    </div>
  )
}
