import { useCallback, useState, useEffect } from 'react';

import { RegularText} from '@softwareone-platform/sdk-react-ui-v0/text';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { useStepActions, StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';

import './SplitBillingStep.scss';
import { AllocateToBuyer } from '../components/allocate-to-buyer/AllocateToBuyer';
import {
  Order,
  SplitBillingAgreement,
  SplitBillingAgreementAllocation,
} from '../../shared/midterm-upgrade';

export function SplitBillingStep({
  agreement,
  order,
  addBuyerToOrder,
  selectedBuyer: selectedBuyerFromParent,
  onChange,
}: {
  agreement: SplitBillingAgreement;
  order: Order;
  addBuyerToOrder: (buyer: { id?: string }) => Promise<void>;
  selectedBuyer: SplitBillingAgreementAllocation;
  onChange: (buyer: SplitBillingAgreementAllocation) => void;
}) {
  const { registerOnNextCallback } = useStepActions();

  const [selectedBuyer, setSelectedBuyer] =
    useState<SplitBillingAgreementAllocation>(selectedBuyerFromParent);
  const [error, setError] = useState('');

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      try {
        await addBuyerToOrder({ id: selectedBuyer?.id });
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : 'Failed to save the selected buyer.'
        );
        return currentStepIndex;
      }
      setError('');
      return targetStepIndex;
    },
    [addBuyerToOrder, selectedBuyer?.id]
  );

  useEffect(() => {
    registerOnNextCallback(onNext);
  }, [onNext, registerOnNextCallback]);

  const changeSelectedBuyer = useCallback(
    (buyer: SplitBillingAgreementAllocation) => {
      setSelectedBuyer(buyer);
      onChange(buyer);
    },
    [onChange]
  )

  return (
    <div className="split-billing-step">
      <div className="split-billing-step__header">
        <RegularText as="h2" size={4}>
          Split Billing
        </RegularText>
      </div>
      <div className="split-billing-step__highlights">
        <WizardHighlights />
      </div>
      {error && (
        <InlineNotification status="error" isStandalone>
          {error}
        </InlineNotification>
      )}
      <div className="split-billing-step__allocate-to-buyer">
        <AllocateToBuyer
          agreementBuyerId={agreement?.buyer?.id ?? ''}
          selectedBuyerId={order?.billTo?.id ?? ''}
          onChange={changeSelectedBuyer}
          allocations={agreement?.allocations ?? []}
        />
      </div>
    </div>
  )
}
