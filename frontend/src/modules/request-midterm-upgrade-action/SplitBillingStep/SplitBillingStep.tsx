import { useCallback, useState, useEffect } from 'react';

import { useTranslation } from 'react-i18next';

import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { useStepActions, StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { WizardHighlights } from '../shared/WizardHighlights/WizardHighlights';

import './SplitBillingStep.scss';
import { AllocateToBuyer } from '../components/allocate-to-buyer/AllocateToBuyer';
import { SplitBillingAllocations } from '../components/split-billing-allocations/SplitBillingAllocations';
import { SplitBillingOption, SplitBillingOptionValue } from '../components/split-billing-option/SplitBillingOption';
import { Order } from '../model';
import { AgreementSplit, AgreementSplitAllocation, Subscription } from '../../shared/model';

export function SplitBillingStep({
  subscription,
  splitAgreement,
  order,
  addBuyerToOrder,
  selectedBuyer: selectedBuyerFromParent,
  onChange,
}: {
  subscription: Subscription;
  splitAgreement: AgreementSplit | null;
  order: Order;
  addBuyerToOrder: (buyer: { id?: string }) => Promise<void>;
  selectedBuyer: AgreementSplitAllocation | null;
  onChange: (buyer: AgreementSplitAllocation) => void;
}) {
  const { t } = useTranslation();
  const { registerOnNextCallback } = useStepActions();

  const [option, setOption] = useState<SplitBillingOptionValue | null>(null);
  const [selectedBuyer, setSelectedBuyer] = useState<AgreementSplitAllocation | null>(
    selectedBuyerFromParent
  );
  const [error, setError] = useState('');

  const agreementBuyerId = subscription?.buyer?.id ?? '';
  const allocations = splitAgreement?.allocations ?? [];

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      const buyerId = option === 'buyer' ? selectedBuyer?.buyer?.id : undefined;
      if (option === null) {
        setError(t('MidtermUpgrade:SplitBilling:Validation:SelectOption'));
        return currentStepIndex;
      }
      if (option === 'buyer' && !buyerId) {
        setError(t('MidtermUpgrade:SplitBilling:Validation:SelectBuyer'));
        return currentStepIndex;
      }
      try {
        if (option === 'buyer') {
          await addBuyerToOrder({ id: buyerId });
        }
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : t('MidtermUpgrade:SplitBilling:Validation:SaveFailed')
        );
        return currentStepIndex;
      }
      setError('');
      return targetStepIndex;
    },
    [addBuyerToOrder, option, selectedBuyer?.buyer?.id, t]
  );

  useEffect(() => {
    registerOnNextCallback(onNext);
  }, [onNext, registerOnNextCallback]);

  const changeSelectedBuyer = useCallback(
    (buyer: AgreementSplitAllocation) => {
      setSelectedBuyer(buyer);
      onChange(buyer);
    },
    [onChange]
  );

  return (
    <div className="split-billing-step">
      <div className="split-billing-step__header">
        <RegularText as="h2" size={4}>
          {t('MidtermUpgrade:Steps:Split billing')}
        </RegularText>
      </div>
      <div className="split-billing-step__highlights">
        <WizardHighlights subscription={subscription} />
      </div>
      {error && (
        <div className="split-billing-step__error">
          <InlineNotification status="error" isStandalone>
            {error}
          </InlineNotification>
        </div>
      )}
      {option === null && <SplitBillingOption onSelect={setOption} />}
      {option === 'percentages' && (
        <SplitBillingAllocations allocations={allocations} agreementBuyerId={agreementBuyerId} />
      )}
      {option === 'buyer' && (
        <AllocateToBuyer
          agreementBuyerId={agreementBuyerId}
          selectedBuyerId={order?.billTo?.id ?? ''}
          onChange={changeSelectedBuyer}
          allocations={allocations}
        />
      )}
    </div>
  );
}
