import { useCallback, useState, useEffect } from 'react';

import { useTranslation } from 'react-i18next';

import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { useStepActions, StepNavigationProperties } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';

import './SplitBillingStep.scss';
import { AllocateToBuyer } from '../components/allocate-to-buyer/AllocateToBuyer';
import { SplitBillingAllocations } from '../components/split-billing-allocations/SplitBillingAllocations';
import { SplitBillingOption, SplitBillingOptionValue } from '../components/split-billing-option/SplitBillingOption';
import { Order } from '../model';
import { AgreementSplit, AgreementSplitAllocation, Subscription } from '../../shared/model';

export function SplitBillingStep({
  subscription,
  split,
  agreementSplit,
  order,
  addBuyerToOrder,
  selectedBuyer: selectedBuyerFromParent,
  onChange,
  option,
  onOptionChange,
}: {
  subscription: Subscription;
  split: AgreementSplit | null;
  agreementSplit: AgreementSplit | null;
  order: Order;
  addBuyerToOrder: (buyer: { id?: string }) => Promise<void>;
  selectedBuyer: AgreementSplitAllocation | null;
  onChange: (buyer: AgreementSplitAllocation) => void;
  option: SplitBillingOptionValue | null;
  onOptionChange: (option: SplitBillingOptionValue | null) => void;
}) {
  const { t } = useTranslation();
  const { registerOnNextCallback, registerOnBackCallback } = useStepActions();

  // The option list and the allocation/buyer view are two phases of this one
  // step: ``selectedOption`` is what the radio shows, ``option`` is the choice
  // Next has confirmed, and only the latter switches the view. The confirmed
  // choice lives in the parent, so it survives the step being unmounted while
  // the wizard shows a later step.
  const [selectedOption, setSelectedOption] = useState<SplitBillingOptionValue | null>(option);
  const [selectedBuyer, setSelectedBuyer] = useState<AgreementSplitAllocation | null>(
    selectedBuyerFromParent
  );
  const [error, setError] = useState('');

  const agreementBuyerId = subscription?.buyer?.id ?? '';
  const allocations = split?.allocations ?? [];
  const agreementAllocations = agreementSplit?.allocations ?? [];
  const noBuyers = agreementAllocations.length === 0;

  const onNext = useCallback(
    async ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      if (option === null) {
        if (selectedOption === null) {
          setError(t('MidtermUpgrade:SplitBilling:Validation:SelectOption'));
          return currentStepIndex;
        }
        onOptionChange(selectedOption);
        setError('');
        return currentStepIndex;
      }
      const buyerId = option === 'buyer' ? selectedBuyer?.buyer?.id : undefined;
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
    [addBuyerToOrder, option, onOptionChange, selectedOption, selectedBuyer?.buyer?.id, t]
  );

  useEffect(() => registerOnNextCallback(onNext), [onNext, registerOnNextCallback]);

  const onBack = useCallback(
    ({ currentStepIndex, targetStepIndex }: StepNavigationProperties) => {
      if (option === null) {
        return targetStepIndex;
      }
      onOptionChange(null);
      setError('');
      return currentStepIndex;
    },
    [option, onOptionChange]
  );

  useEffect(() => registerOnBackCallback(onBack), [onBack, registerOnBackCallback]);

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
        <WizardHighlights agreement={subscription.agreement} parties={subscription} />
      </div>
      {(error || noBuyers) && (
        <div className="split-billing-step__error">
          <InlineNotification status="error">
            {error || t('MidtermUpgrade:SplitBilling:NoBuyers')}
          </InlineNotification>
        </div>
      )}
      {option === null && (
        <SplitBillingOption
          onSelect={setSelectedOption}
          selectedValue={selectedOption}
          isBuyerDisabled={noBuyers}
        />
      )}
      {option === 'percentages' && (
        <SplitBillingAllocations allocations={allocations} agreementBuyerId={agreementBuyerId} />
      )}
      {option === 'buyer' && !noBuyers && (
        <AllocateToBuyer
          agreementBuyerId={agreementBuyerId}
          selectedBuyerId={order?.billTo?.id ?? ''}
          onChange={changeSelectedBuyer}
          allocations={agreementAllocations}
        />
      )}
    </div>
  );
}
